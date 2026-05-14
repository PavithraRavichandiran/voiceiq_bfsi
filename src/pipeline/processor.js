const OpenAI = require('openai');
const { ZodError } = require('zod');
const config = require('../config');
const { EntitiesSchema } = require('./schema');
const { LatencyTracker } = require('../utils/latencyTracker');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT = `You are a Hinglish financial voice call processor for Indian BFSI (Banking, Financial Services, Insurance).

You will receive a raw STT transcript that may contain Hinglish (Hindi + English) and phonetic noise.
Your job has TWO parts — return both results in a single JSON response.

━━━ PART 1: STT CORRECTION ━━━
Fix phonetic STT errors while preserving meaning:
- Phonetic substitutions: "lon"→"loan", "parsonal"→"personal", "kradit"→"credit", "salry"→"salary"
- Merged words: "personallon"→"personal loan"
- Hindi word errors: "paansh"→"paanch", "lak"→"lakh", "hazar"→"hazaar", "mahna"→"mahine"
- Keep Hinglish structure intact — do NOT translate Hindi to English
- Preserve all numbers and amounts exactly
- Remove hallucinated/filler words that don't fit the financial context (e.g. "file", "yeah", "um", random nouns mid-sentence)
- When a word and a digit express the same value back-to-back (e.g. "file 5 lakh", "paanch 5 lakh"), the speaker stuttered — keep only the digit or the correct word, not both

━━━ PART 2: ENTITY EXTRACTION ━━━
Hindi number words: ek=1, do=2, teen=3, chaar=4, paanch=5, chhe=6, saat=7, aath=8, nau=9,
das=10, barah=12, pandrah=15, bees=20, tees=30, pachaas=50, sau=100, hazaar=1000,
lakh=100000, crore=10000000
Compound: "teen lakh"=300000, "paanch hazaar"=5000, "do lakh pachaas hazaar"=250000

ENTITY RULES:

loan_amount: Numeric loan/investment/cover amount in INR. null if not mentioned.

loan_tenure: Duration explicitly stated by the caller (e.g. "24 mahine ke liye", "5 saal ke liye").
  - Use "months" for mahine/month, "years" for saal/year
  - ONLY extract if a duration is explicitly stated — do NOT infer or guess
  - null if no duration mentioned

emi_amount: Monthly instalment amount in INR. null if not mentioned.

product_type: One of personal_loan | home_loan | car_loan | credit_card | insurance | fd | rd | mutual_fund
  - Infer from context: "ghar ke liye loan"→home_loan, "car ke liye"→car_loan, "SIP"→mutual_fund
  - null only if truly ambiguous

pan_number: Format = 5 uppercase letters + 4 digits + 1 uppercase letter (e.g. ABCDE1234F). null if absent.

monthly_income: Caller's stated monthly salary/income in INR. null if not mentioned.

interest_rate: Explicitly stated interest/byaaj rate as a percentage. null if not mentioned.

call_intent: ALWAYS infer — never return null. Choose the best fit:
  - loan_enquiry   → caller asking about any loan/FD/RD/insurance product
  - complaint      → caller reporting a problem, wrong charge, or dissatisfaction
  - data_validation→ caller calling for KYC, PAN/Aadhaar verification
  - emi_payment    → caller discussing EMI payment, rescheduling, or bounce
  - collections    → agent/bank following up on overdue payment
  - general_enquiry→ status checks, rejections, limit changes, anything else

CONFIDENCE: 1.0=explicitly stated, 0.8=clearly implied, 0.6=inferred from context
Do NOT hallucinate values not present in the transcript.

━━━ RESPONSE FORMAT ━━━
Return ONLY this JSON object, no explanation:
{
  "corrected_transcript": "<corrected text>",
  "entities": {
    "loan_amount":    { "value": <number>, "currency": "INR", "confidence": <0-1> } | null,
    "loan_tenure":    { "value": <number>, "unit": "months"|"years", "confidence": <0-1> } | null,
    "emi_amount":     { "value": <number>, "currency": "INR", "confidence": <0-1> } | null,
    "product_type":   { "value": "<enum>", "confidence": <0-1> } | null,
    "pan_number":     { "value": "<PAN>", "confidence": <0-1> } | null,
    "monthly_income": { "value": <number>, "currency": "INR", "confidence": <0-1> } | null,
    "interest_rate":  { "value": <number>, "unit": "percent", "confidence": <0-1> } | null,
    "call_intent":    { "value": "<enum>", "confidence": <0-1> }
  }
}`;

async function processTranscript(rawTranscript, signal) {
  const tracker = new LatencyTracker();
  tracker.start('processing');

  let raw;
  try {
    const response = await openai.chat.completions.create(
      {
        model: config.llmModel,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 700,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: `Process this transcript:\n\n${rawTranscript}` },
        ],
      },
      { signal }
    );

    raw = JSON.parse(response.choices[0].message.content);
  } catch (err) {
    const ms = tracker.end('processing');
    if (err.name === 'AbortError') throw err;
    logger.error('processing failed', { error: err.message, ms });
    throw new Error(`Processing failed: ${err.message}`);
  }

  const ms = tracker.end('processing');

  let entities;
  try {
    entities = EntitiesSchema.parse(raw.entities);
  } catch (err) {
    if (err instanceof ZodError) {
      logger.warn('schema validation warning', { issues: err.issues });
      entities = raw.entities;
    } else {
      throw err;
    }
  }

  logger.info('transcript processed', { processing_ms: ms });
  return {
    corrected_transcript: raw.corrected_transcript || rawTranscript,
    entities,
    processing_ms: ms,
  };
}

module.exports = { processTranscript };
