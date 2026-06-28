/**
 * Risk Engine Middleware
 * Scores each auth attempt and returns riskLevel: low | medium | high
 * Triggers step-up auth when risk is high.
 */

const crypto = require('crypto');

// In-memory stores (swap for Redis in production)
const failedAttempts  = new Map(); // ip+email => { count, lastAt }
const knownDevices    = new Map(); // userId => Set<deviceHash>
const lastLoginIP     = new Map(); // userId => { ip, country, ts }

const FAIL_WINDOW_MS  = 15 * 60 * 1000; // 15 min
const MAX_FAILS       = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashDevice(req) {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  const enc  = req.headers['accept-encoding'] || '';
  return crypto.createHash('sha256').update(`${ua}|${lang}|${enc}`).digest('hex').slice(0, 16);
}

function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Rough country from IP prefix (prod: use maxmind or ip-api.com)
function guessCountry(ip) {
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '127.0.0.1' || ip === '::1') return 'local';
  return ip.split('.')[0]; // placeholder — replace with real geo lookup
}

// ── Score calculation ─────────────────────────────────────────────────────────

function calcScore(factors) {
  let score = 0;
  if (factors.newDevice)       score += 25;
  if (factors.newCountry)      score += 30;
  if (factors.manyFailures)    score += 40;
  if (factors.suspiciousUA)    score += 20;
  if (factors.impossibleTravel) score += 50;
  return score;
}

function scoreToLevel(score) {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

// ── Record failure ─────────────────────────────────────────────────────────────

exports.recordFailedAttempt = (ip, identifier) => {
  const key = `${ip}|${identifier}`;
  const now = Date.now();
  const entry = failedAttempts.get(key) || { count: 0, lastAt: now };
  if (now - entry.lastAt > FAIL_WINDOW_MS) {
    entry.count = 0;
  }
  entry.count += 1;
  entry.lastAt = now;
  failedAttempts.set(key, entry);
};

exports.resetFailedAttempts = (ip, identifier) => {
  failedAttempts.delete(`${ip}|${identifier}`);
};

// ── Register known device after successful login ──────────────────────────────

exports.registerDevice = (userId, deviceHash) => {
  if (!knownDevices.has(userId)) knownDevices.set(userId, new Set());
  knownDevices.get(userId).add(deviceHash);
};

exports.updateLastIP = (userId, ip) => {
  lastLoginIP.set(userId, { ip, country: guessCountry(ip), ts: Date.now() });
};

// ── Main assessment ───────────────────────────────────────────────────────────

exports.assess = (req, userId, identifier) => {
  const ip         = getClientIP(req);
  const deviceHash = hashDevice(req);
  const country    = guessCountry(ip);
  const ua         = (req.headers['user-agent'] || '').toLowerCase();

  // Failed attempts
  const key         = `${ip}|${identifier}`;
  const failEntry   = failedAttempts.get(key) || { count: 0, lastAt: 0 };
  const manyFails   = failEntry.count >= MAX_FAILS &&
                      (Date.now() - failEntry.lastAt) < FAIL_WINDOW_MS;

  // Device recognition
  const userDevices = knownDevices.get(String(userId)) || new Set();
  const newDevice   = !userDevices.has(deviceHash);

  // Country change
  const lastLogin   = lastLoginIP.get(String(userId));
  const newCountry  = lastLogin && lastLogin.country !== country && country !== 'local';

  // Impossible travel (>= 2 different countries within 1 hour)
  const impossibleTravel = lastLogin && newCountry &&
    (Date.now() - lastLogin.ts) < 60 * 60 * 1000;

  // Headless / bot UA
  const suspiciousUA = ua.includes('headless') || ua.includes('puppeteer') ||
                       ua.includes('playwright') || ua === '';

  const factors = { newDevice, newCountry, manyFails, suspiciousUA, impossibleTravel };
  const score   = calcScore(factors);
  const level   = scoreToLevel(score);

  return {
    riskLevel:   level,
    riskScore:   score,
    factors,
    deviceHash,
    ip,
    country,
    requiresMFA: level === 'high',
    requiresPasskey: level === 'high' || (level === 'medium' && newDevice),
  };
};

// ── Express middleware (attaches risk to req) ─────────────────────────────────

exports.middleware = (req, res, next) => {
  req.risk = {
    ip:          getClientIP(req),
    deviceHash:  hashDevice(req),
    country:     guessCountry(getClientIP(req)),
    assess: (userId, identifier) => exports.assess(req, userId, identifier),
  };
  next();
};
