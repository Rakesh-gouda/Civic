import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

export class AIConfigError extends Error {
  constructor(message = 'GEMINI_API_KEY is not configured on the server. AI features are unavailable until a key is added to .env.') {
    super(message);
    this.name = 'AIConfigError';
  }
}

export class AIRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AIRequestError';
  }
}

export function isAiConfigured() {
  return Boolean(API_KEY && API_KEY !== 'your_gemini_api_key_here');
}

function getModel() {
  if (!isAiConfigured()) throw new AIConfigError();
  const client = new GoogleGenerativeAI(API_KEY);
  return client.getGenerativeModel({
    model: MODEL,
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  });
}

function parseJson(text) {
  const cleaned = String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
    throw new AIRequestError('The AI returned a response that could not be parsed as JSON. Please retry.');
  }
}

async function generateJson(prompt) {
  const model = getModel();
  let result;
  try {
    result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new AIRequestError('The AI request timed out after 45 seconds. Please retry.')), 45000)),
    ]);
  } catch (err) {
    if (err instanceof AIConfigError || err instanceof AIRequestError) throw err;
    throw new AIRequestError(`Gemini request failed: ${err.message}`);
  }
  return parseJson(result.response.text());
}

const CATEGORIES = ['pothole', 'road_damage', 'drainage_blockage', 'waterlogging', 'garbage_overflow', 'broken_streetlight', 'electrical_hazard', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normaliseAnalysis(raw) {
  const classification = raw.classification || {};
  const priority = raw.priority || {};
  const duplicate = raw.duplicate || {};
  const brief = raw.actionBrief || {};

  const category = CATEGORIES.includes(classification.category) ? classification.category : 'other';
  const urgency = PRIORITIES.includes(priority.urgencyLevel)
    ? priority.urgencyLevel
    : clamp(priority.score, 0, 100) >= 75
      ? 'critical'
      : clamp(priority.score, 0, 100) >= 50
        ? 'high'
        : clamp(priority.score, 0, 100) >= 25
          ? 'medium'
          : 'low';

  const reasons = Array.isArray(priority.reasons) ? priority.reasons.map(String).slice(0, 4) : [];
  const confidence = clamp(duplicate.confidence, 0, 100);
  const isDuplicate = Boolean(duplicate.isDuplicate) && confidence >= 60;
  const requiresAdminVerification = isDuplicate && confidence < 85;

  return {
    classification: {
      category,
      confidence: clamp(classification.confidence, 0, 100),
      reasoning: String(classification.reasoning || 'No reasoning returned by the model.'),
      alternativeCategory: classification.alternativeCategory && CATEGORIES.includes(classification.alternativeCategory) ? classification.alternativeCategory : null,
      keywords: Array.isArray(classification.keywords) ? classification.keywords.map(String).slice(0, 8) : [],
    },
    summary: String(raw.summary || '').trim(),
    duplicate: {
      isDuplicate,
      confidence,
      matchedTicketId: duplicate.matchedTicketId ? String(duplicate.matchedTicketId) : null,
      reasoning: String(duplicate.reasoning || 'No duplicate reasoning returned by the model.'),
      requiresAdminVerification,
    },
    priority: {
      score: clamp(priority.score, 0, 100),
      urgencyLevel: urgency,
      safetyFactor: clamp(priority.safetyFactor, 0, 25),
      peopleFactor: clamp(priority.peopleFactor, 0, 25),
      urgencyFactor: clamp(priority.urgencyFactor, 0, 25),
      durationFactor: clamp(priority.durationFactor, 0, 25),
      reasons,
      estimatedResolutionHours: clamp(priority.estimatedResolutionHours, 1, 720, 48),
      recommendedAction: String(priority.recommendedAction || brief.recommendedAction || ''),
    },
    actionBrief: {
      problem: String(brief.problem || ''),
      location: String(brief.location || ''),
      severity: String(brief.severity || ''),
      publicImpact: String(brief.publicImpact || ''),
      recommendedDepartment: String(brief.recommendedDepartment || ''),
      recommendedAction: String(brief.recommendedAction || ''),
      targetResolutionHours: clamp(brief.targetResolutionHours, 1, 720, 48),
      aiExplanation: String(brief.aiExplanation || ''),
    },
    source: 'gemini',
    model: MODEL,
    analysedAt: new Date().toISOString(),
  };
}

export async function analyzeComplaint(complaint, nearby = []) {
  const candidates = nearby.slice(0, 8).map(c => ({
    id: c.id,
    ticketNumber: c.ticketNumber,
    title: c.title,
    description: String(c.description || '').slice(0, 220),
    category: c.category,
    location: c.location,
    distanceMeters: c.distanceMeters,
    status: c.status,
  }));

  const prompt = `You are the CIVICTRACK AI engine for an Indian municipal corporation.
Analyse ONE civic complaint and return a single JSON object.

COMPLAINT:
${JSON.stringify({
    title: complaint.title,
    description: complaint.description,
    categorySelectedByCitizen: complaint.category,
    location: complaint.location,
    reportedAt: complaint.createdAt,
  }, null, 2)}

NEARBY COMPLAINTS (server-filtered to within 1 km; may be empty):
${JSON.stringify(candidates, null, 2)}

VALID CATEGORIES: ${CATEGORIES.join(', ')}

Rules:
1. CLASSIFICATION: choose exactly one valid category. Confidence 0-100. Give reasoning grounded in the complaint text.
2. SUMMARY: factual, maximum 40 words, keep location and severity.
3. DUPLICATE DETECTION: a duplicate is the SAME physical problem at nearly the same location.
   - confidence >= 85: likely duplicate and may be linked to the matched ticket.
   - 60-84: possible duplicate, MUST require admin verification; never auto-merge.
   - < 60: not a duplicate.
   - Resolved complaints are duplicates only if the problem clearly recurred.
4. PRIORITY: score 0-100 = safetyFactor + peopleFactor + urgencyFactor + durationFactor (each 0-25).
   Thresholds: 75-100 critical, 50-74 high, 25-49 medium, 0-24 low.
   Give four reasons, one per factor.
5. ACTION BRIEF: practical structured brief for a field officer.
6. Never invent facts that are not supported by the complaint or nearby records. If information is missing, say so.

Return ONLY this JSON shape:
{
  "classification": {"category":"...", "confidence": 0, "reasoning":"...", "alternativeCategory": null, "keywords": ["..."]},
  "summary": "...",
  "duplicate": {"isDuplicate": false, "confidence": 0, "matchedTicketId": null, "reasoning":"..."},
  "priority": {"score": 0, "urgencyLevel":"low", "safetyFactor":0, "peopleFactor":0, "urgencyFactor":0, "durationFactor":0, "reasons":["...","...","...","..."], "estimatedResolutionHours": 48, "recommendedAction":"..."},
  "actionBrief": {"problem":"...", "location":"...", "severity":"...", "publicImpact":"...", "recommendedDepartment":"...", "recommendedAction":"...", "targetResolutionHours": 48, "aiExplanation":"..."}
}`;

  const raw = await generateJson(prompt);
  return normaliseAnalysis(raw);
}

export async function classifyComplaint(title, description) {
  const raw = await generateJson(`You are a civic complaint classification AI. Classify into exactly one of: ${CATEGORIES.join(', ')}.
Title: ${title || '(none)'}
Description: ${description || '(none)'}
Return JSON: {"category":"...","confidence":0,"reasoning":"...","alternativeCategory":null,"keywords":["..."]}`);
  return {
    category: CATEGORIES.includes(raw.category) ? raw.category : 'other',
    confidence: clamp(raw.confidence, 0, 100),
    reasoning: String(raw.reasoning || ''),
    alternativeCategory: raw.alternativeCategory || null,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
    source: 'gemini',
    model: MODEL,
  };
}

export async function summarizeComplaint(description) {
  const raw = await generateJson(`Condense this civic complaint into a factual summary of at most 40 words. Do not add facts.
Description: "${description}"
Return JSON: {"summary":"..."}`);
  return { summary: String(raw.summary || '').trim(), source: 'gemini', model: MODEL };
}

export async function generateActionBrief(complaint) {
  const raw = await generateJson(`Create a structured municipal action brief from this complaint. Do not invent details.
Complaint: ${JSON.stringify(complaint, null, 2)}
Return JSON: {"problem":"...","location":"...","severity":"...","publicImpact":"...","recommendedDepartment":"...","recommendedAction":"...","targetResolutionHours":48,"aiExplanation":"..."}`);
  return { ...raw, source: 'gemini', model: MODEL };
}
