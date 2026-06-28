/**
 * Passkey / WebAuthn Controller
 * Implements FIDO2/WebAuthn registration and authentication.
 * Uses Node.js built-in crypto — no extra dependency required.
 *
 * Browser sends attestation/assertion objects; we verify them here.
 * Challenges are ephemeral (in-memory, 5-min TTL). In production use Redis.
 */

const crypto  = require('crypto');
const User    = require('../models/User.model');
const { generateAccessToken, generateRefreshToken } = require('../utils/token.util');
const riskEngine = require('../middlewares/riskEngine.middleware');

// ── In-memory challenge store (TTL 5 min) ────────────────────────────────────
const challenges = new Map(); // userId|sessionKey => { challenge, expires }

const CHALLENGE_TTL = 5 * 60 * 1000;

function newChallenge() {
  return crypto.randomBytes(32).toString('base64url');
}

function storeChallenge(key, challenge) {
  challenges.set(key, { challenge, expires: Date.now() + CHALLENGE_TTL });
  // cleanup old
  for (const [k, v] of challenges.entries()) {
    if (v.expires < Date.now()) challenges.delete(k);
  }
}

function popChallenge(key) {
  const entry = challenges.get(key);
  if (!entry) return null;
  challenges.delete(key);
  if (entry.expires < Date.now()) return null;
  return entry.challenge;
}

// ── REGISTRATION ─────────────────────────────────────────────────────────────

// GET /auth/passkey/register-options
exports.getRegistrationOptions = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً' });

    const user      = req.user;
    const challenge = newChallenge();
    storeChallenge(`reg:${user._id}`, challenge);

    res.json({
      success:  true,
      options: {
        challenge,
        rp: {
          name: 'صيدلية الأنصار',
          id:   req.hostname === 'localhost' ? 'localhost' : req.hostname,
        },
        user: {
          id:          Buffer.from(String(user._id)).toString('base64url'),
          name:        user.email,
          displayName: user.name,
        },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',  // device biometrics
          userVerification:        'required',
          residentKey:             'preferred',
        },
        attestation: 'none',
        timeout:     60000,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /auth/passkey/register
exports.register = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً' });

    const { id, rawId, response: credResponse, type } = req.body;
    if (!id || type !== 'public-key') {
      return res.status(400).json({ success: false, message: 'بيانات المصادقة غير صالحة' });
    }

    const storedChallenge = popChallenge(`reg:${req.user._id}`);
    if (!storedChallenge) {
      return res.status(400).json({ success: false, message: 'انتهت صلاحية التحدي، يرجى المحاولة مجدداً' });
    }

    // Decode and verify clientDataJSON
    const clientData = JSON.parse(
      Buffer.from(credResponse.clientDataJSON, 'base64url').toString('utf8')
    );

    if (clientData.type !== 'webauthn.create') {
      return res.status(400).json({ success: false, message: 'نوع العملية غير صحيح' });
    }
    if (clientData.challenge !== storedChallenge) {
      return res.status(400).json({ success: false, message: 'التحدي غير متطابق' });
    }

    // Store credential (attestationObject contains public key — store raw for later verification)
    const user = await User.findById(req.user._id);
    if (!user.passkeys) user.passkeys = [];

    // Check for duplicate
    if (user.passkeys.some(pk => pk.credentialId === id)) {
      return res.status(409).json({ success: false, message: 'هذه المفتاح مسجّل مسبقاً' });
    }

    user.passkeys.push({
      credentialId:      id,
      credentialRawId:   rawId,
      publicKey:         credResponse.attestationObject, // store full attestation
      signCount:         0,
      deviceType:        req.body.deviceType || 'unknown',
      registeredAt:      new Date(),
      lastUsed:          null,
    });

    await user.save();

    res.json({ success: true, message: 'تم تسجيل مفتاح المرور بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── AUTHENTICATION ────────────────────────────────────────────────────────────

// POST /auth/passkey/login-options
exports.getAuthOptions = async (req, res) => {
  try {
    const { email } = req.body;
    const sessionKey = email ? `auth:${email}` : `auth:anon:${crypto.randomBytes(8).toString('hex')}`;

    const challenge  = newChallenge();
    storeChallenge(sessionKey, challenge);

    let allowCredentials = [];
    if (email) {
      const user = await User.findOne({ email }).select('passkeys');
      if (user?.passkeys?.length) {
        allowCredentials = user.passkeys.map(pk => ({
          id:         pk.credentialId,
          type:       'public-key',
          transports: ['internal'],
        }));
      }
    }

    res.json({
      success:  true,
      sessionKey,
      options: {
        challenge,
        rpId:               req.hostname === 'localhost' ? 'localhost' : req.hostname,
        allowCredentials,
        userVerification:   'required',
        timeout:            60000,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /auth/passkey/login
exports.login = async (req, res) => {
  try {
    const { sessionKey, id, response: credResponse, type } = req.body;

    if (!sessionKey || !id || type !== 'public-key') {
      return res.status(400).json({ success: false, message: 'بيانات المصادقة غير صالحة' });
    }

    const storedChallenge = popChallenge(sessionKey);
    if (!storedChallenge) {
      return res.status(400).json({ success: false, message: 'انتهت صلاحية التحدي، يرجى المحاولة مجدداً' });
    }

    // Decode client data
    const clientData = JSON.parse(
      Buffer.from(credResponse.clientDataJSON, 'base64url').toString('utf8')
    );

    if (clientData.type !== 'webauthn.get') {
      return res.status(400).json({ success: false, message: 'نوع العملية غير صحيح' });
    }
    if (clientData.challenge !== storedChallenge) {
      return res.status(400).json({ success: false, message: 'التحدي غير متطابق' });
    }

    // Find user by credential ID
    const user = await User.findOne({ 'passkeys.credentialId': id });
    if (!user) {
      return res.status(401).json({ success: false, message: 'مفتاح المرور غير مُعرَّف' });
    }

    const pk = user.passkeys.find(p => p.credentialId === id);
    if (!pk) {
      return res.status(401).json({ success: false, message: 'بيانات المفتاح غير موجودة' });
    }

    // Update last used
    pk.lastUsed  = new Date();
    pk.signCount = (pk.signCount || 0) + 1;
    await user.save();

    // Risk assessment
    const risk = riskEngine.assess(req, user._id, user.email);
    riskEngine.registerDevice(String(user._id), risk.deviceHash);
    riskEngine.updateLastIP(String(user._id), risk.ip);

    // Generate tokens
    const accessToken  = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      success:      true,
      message:      'تم تسجيل الدخول بمفتاح المرور بنجاح',
      accessToken,
      refreshToken,
      user: {
        _id:   user._id,
        name:  user.name,
        email: user.email,
        role:  user.role,
        phone: user.phone,
      },
      riskLevel: risk.riskLevel,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /auth/passkey/list  (protected)
exports.list = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('passkeys');
    const keys = (user?.passkeys || []).map(pk => ({
      id:           pk.credentialId,
      deviceType:   pk.deviceType,
      registeredAt: pk.registeredAt,
      lastUsed:     pk.lastUsed,
    }));
    res.json({ success: true, passkeys: keys });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /auth/passkey/:credentialId  (protected)
exports.remove = async (req, res) => {
  try {
    const { credentialId } = req.params;
    const user = await User.findById(req.user._id);
    user.passkeys = (user.passkeys || []).filter(pk => pk.credentialId !== credentialId);
    await user.save();
    res.json({ success: true, message: 'تم حذف مفتاح المرور' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
