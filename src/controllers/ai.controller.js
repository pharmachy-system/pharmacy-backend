/**
 * AI Controller
 * Provides medical AI features. When ANTHROPIC_API_KEY is set, routes
 * to the Anthropic Claude API. Otherwise falls back to a rule-based
 * offline engine so the app is always functional.
 */

const asyncHandler = require("express-async-handler");
const AppError     = require("../utils/AppError");
const Medicine     = require("../models/Medicine.model");

// ─── Offline knowledge base ───────────────────────────────────────────────────
const SYMPTOM_MAP = {
  صداع:         { conditions: ["صداع التوتر","الشقيقة","ارتفاع ضغط الدم"], urgency: "منخفض" },
  حمى:          { conditions: ["نزلة البرد","الإنفلونزا","عدوى بكتيرية"],    urgency: "متوسط" },
  سعال:         { conditions: ["نزلة البرد","الربو","الجهاز التنفسي"],        urgency: "منخفض" },
  "ألم في الحلق":  { conditions: ["التهاب الحلق","اللوزتين","نزلة البرد"],   urgency: "منخفض" },
  غثيان:        { conditions: ["اضطراب الجهاز الهضمي","تسمم غذائي"],         urgency: "متوسط" },
  دوار:         { conditions: ["انخفاض ضغط الدم","الدوخة الوضعية"],          urgency: "متوسط" },
  إرهاق:        { conditions: ["قلة النوم","فقر الدم","نقص فيتامين D"],       urgency: "منخفض" },
  "ألم في البطن": { conditions: ["اضطراب المعدة","القولون العصبي","التهاب المعدة"], urgency: "متوسط" },
  "ضيق في التنفس": { conditions: ["الربو","القلب","الحساسية"],              urgency: "مرتفع" },
};

const DRUG_INFO = {
  "باراسيتامول":  { uses: "مسكن ألم وخافض حرارة", dose: "500-1000 ملغ كل 4-6 ساعات", max: "4000 ملغ/يوم" },
  "إيبوبروفين":  { uses: "مسكن ألم ومضاد التهاب", dose: "400-600 ملغ كل 6-8 ساعات", max: "2400 ملغ/يوم" },
  "أموكسيسيلين": { uses: "مضاد حيوي شامل", dose: "500 ملغ كل 8 ساعات", max: "3000 ملغ/يوم" },
  "أوميبرازول":  { uses: "تقليل حموضة المعدة", dose: "20-40 ملغ مرة يومياً", max: "80 ملغ/يوم" },
  "ميتفورمين":   { uses: "علاج السكري النوع الثاني", dose: "500-1000 ملغ مع الوجبات", max: "2550 ملغ/يوم" },
};

// ─── Claude API helper ────────────────────────────────────────────────────────
async function callClaude(messages, systemPrompt) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client    = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response  = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:     systemPrompt,
      messages,
    });
    return response.content[0]?.text || null;
  } catch {
    return null;
  }
}

// ─── POST /ai/chat ────────────────────────────────────────────────────────────
exports.medicalChat = asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message?.trim()) throw new AppError("الرسالة مطلوبة", 400);

  const systemPrompt = `أنت مساعد صيدلاني طبي تابع لصيدلية الأنصار. دورك:
- الإجابة على أسئلة الأدوية والصحة العامة بدقة ووضوح
- تقديم معلومات عن الجرعات، التفاعلات، والأعراض الجانبية
- تحويل المستخدم للطبيب عند الحالات الخطرة
- الإجابة باللغة العربية دائماً بأسلوب ودي ومهني
- لا تشخّص أمراضاً وأكد دائماً على أهمية استشارة الطبيب
القاعدة الذهبية: المعلومات التعليمية فقط — لا علاج، لا تشخيص قاطع.`;

  const messages = [
    ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  // Try Claude first
  const aiReply = await callClaude(messages, systemPrompt);
  if (aiReply) {
    return res.json({ success: true, reply: aiReply, source: "claude" });
  }

  // Offline fallback: keyword match
  const lower = message.toLowerCase();
  let reply = "";

  const drugMatch = Object.keys(DRUG_INFO).find(d => lower.includes(d.toLowerCase()));
  if (drugMatch) {
    const info = DRUG_INFO[drugMatch];
    reply = `**${drugMatch}**\n📋 الاستخدام: ${info.uses}\n💊 الجرعة: ${info.dose}\n⚠️ الحد الأقصى: ${info.max}\n\nيُنصح دائماً باستشارة الصيدلاني أو الطبيب قبل تناول أي دواء.`;
  } else if (lower.includes("جرعة") || lower.includes("دواء") || lower.includes("دواه")) {
    reply = "معلومات الجرعات تختلف حسب العمر والحالة الصحية والأدوية الأخرى. يُرجى استشارة الصيدلاني للحصول على توصية دقيقة لحالتك.";
  } else if (lower.includes("تفاعل") || lower.includes("مزج")) {
    reply = "تفاعلات الأدوية موضوع حساس. استخدم أداة فحص التفاعلات الدوائية في تطبيقنا أو تحدث مع صيدلانينا مباشرة.";
  } else if (lower.includes("حمل") || lower.includes("رضاعة")) {
    reply = "سلامة الأدوية خلال الحمل والرضاعة تحتاج مراجعة طبيب متخصص. لا تتناولي أي دواء دون استشارة طبيبك.";
  } else {
    reply = `شكراً على سؤالك. بخصوص "${message}" — للحصول على معلومات دقيقة وموثوقة، يُنصح باستشارة صيدلانينا المتاحين على مدار الساعة. يمكنك أيضاً تصفح قسم المقالات الصحية في تطبيقنا للمزيد من المعلومات.`;
  }

  res.json({ success: true, reply, source: "offline" });
});

// ─── POST /ai/symptom-check ───────────────────────────────────────────────────
exports.symptomCheck = asyncHandler(async (req, res) => {
  const { symptoms = [], duration, severity } = req.body;
  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    throw new AppError("يرجى إدخال أعراض واحد على الأقل", 400);
  }

  const systemPrompt = `أنت نظام تشخيص طبي تعليمي. بناءً على الأعراض المُدخلة، قدّم:
1. قائمة الحالات المحتملة (2-4 حالات) مع احتمالية كل منها (مرتفعة/متوسطة/منخفضة)
2. توصيات عملية (3-5 نقاط)
3. مستوى الاستعجال: منخفض/متوسط/مرتفع/عاجل
أجب بـ JSON فقط بهذا الشكل:
{"possibleConditions":[{"name":"","probability":"","description":""}],"recommendations":[],"urgencyLevel":""}
لا تشخّص بشكل قاطع. أكد أن هذا للأغراض التعليمية فقط.`;

  const userMsg = `الأعراض: ${symptoms.join(", ")}. المدة: ${duration || "غير محدد"}. الشدة: ${severity || 5}/10`;

  const aiText = await callClaude([{ role: "user", content: userMsg }], systemPrompt);
  if (aiText) {
    try {
      const parsed = JSON.parse(aiText.replace(/```json?\n?/g, "").replace(/```/g, ""));
      return res.json({ success: true, result: { ...parsed, disclaimer: "هذه النتائج للأغراض التثقيفية فقط ولا تُغني عن استشارة طبيب." }, source: "claude" });
    } catch { /* fallthrough */ }
  }

  // Offline fallback
  const matchedConditions = new Set();
  symptoms.forEach(s => {
    const data = SYMPTOM_MAP[s];
    if (data) data.conditions.forEach(c => matchedConditions.add(c));
  });

  const maxUrgency = symptoms.reduce((acc, s) => {
    const u = SYMPTOM_MAP[s]?.urgency;
    const order = ["منخفض","متوسط","مرتفع","عاجل"];
    return (order.indexOf(u) > order.indexOf(acc)) ? u : acc;
  }, "منخفض");

  const result = {
    possibleConditions: [...matchedConditions].slice(0, 4).map((c, i) => ({
      name: c,
      probability: i === 0 ? "متوسطة" : "منخفضة",
      description: "استشر الطبيب للتشخيص الدقيق",
    })),
    recommendations: [
      "الراحة الكافية وشرب السوائل",
      "تجنب الإجهاد الجسدي والنفسي",
      "راقب تطور الأعراض",
      "استشر الطبيب إذا تفاقمت الأعراض أو استمرت أكثر من 3 أيام",
      ...(maxUrgency === "مرتفع" ? ["توجه لأقرب مركز صحي فوراً"] : []),
    ],
    urgencyLevel: maxUrgency,
    disclaimer: "هذه النتائج للأغراض التثقيفية فقط ولا تُغني عن استشارة طبيب متخصص.",
    source: "offline",
  };

  res.json({ success: true, result });
});

// ─── POST /ai/recommend ───────────────────────────────────────────────────────
exports.recommend = asyncHandler(async (req, res) => {
  const { symptoms = [], category } = req.body;

  const query = {};
  if (category) query.category = new RegExp(category, "i");
  if (symptoms.length > 0) {
    query.$or = symptoms.map(s => ({
      $or: [
        { name:        new RegExp(s, "i") },
        { nameAr:      new RegExp(s, "i") },
        { description: new RegExp(s, "i") },
      ],
    }));
  }

  const medicines = await Medicine.find({ ...query, stock: { $gt: 0 } })
    .select("name nameAr price images stock category")
    .limit(10)
    .lean();

  res.json({ success: true, recommendations: medicines, source: "db" });
});

// ─── POST /ai/interactions ────────────────────────────────────────────────────
exports.checkInteractions = asyncHandler(async (req, res) => {
  const { drugs = [] } = req.body;
  if (drugs.length < 2) throw new AppError("أدخل دواءين على الأقل للفحص", 400);

  const systemPrompt = `أنت خبير صيدلاني. افحص التفاعلات بين الأدوية المذكورة وأجب بـ JSON:
{"interactions":[{"drug1":"","drug2":"","severity":"خطير|متوسط|خفيف|لا يوجد","description":""}],"overallRisk":"مرتفع|متوسط|منخفض","recommendation":""}`;

  const aiText = await callClaude(
    [{ role: "user", content: `فحص تفاعل: ${drugs.join(" + ")}` }],
    systemPrompt
  );

  if (aiText) {
    try {
      const parsed = JSON.parse(aiText.replace(/```json?\n?/g, "").replace(/```/g, ""));
      return res.json({ success: true, ...parsed, source: "claude" });
    } catch { /* fallthrough */ }
  }

  res.json({
    success: true,
    interactions: drugs.slice(0,-1).map((d,i) => ({ drug1: d, drug2: drugs[i+1], severity: "غير محدد", description: "تعذر الفحص. استشر صيدلانياً." })),
    overallRisk: "غير محدد",
    recommendation: "يرجى استشارة صيدلاني للتحقق من التفاعلات بين هذه الأدوية.",
    source: "offline",
  });
});
