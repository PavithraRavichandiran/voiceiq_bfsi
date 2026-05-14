const OpenAI = require('openai');
const { ZodError } = require('zod');
const config = require('../config');
const { EntitiesSchema } = require('./schema');
const { LatencyTracker } = require('../utils/latencyTracker');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT = `You are a financial entity extraction engine for Indian BFSI (Banking, Financial Services, Insurance) voice call transcripts.

Transcripts are in Hinglish (Hindi + English code-switching) and may contain spoken Hindi number words.

Hindi number word reference:
ek=1, do=2, teen=3, chaar=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10,
gyarah=11, barah=12, pandrah=15, bees=20, tees=30, pachaas=50, sau=100,
hazaar=1000, lakh=100000, crore=10000000

Compound examples: "teen lakh" = 300000, "paanch hazaar" = 5000, "do lakh pachaas hazaar" = 250000,
"barah mahine" = 12 months, "chaar saal" = 4 years (convert to months: 48)

Extract these entities and return a single JSON object. Set any missing entity to null — do NOT hallucinate values.

JSON shape:
{
  "loan_amount":    { "value": <number>, "currency": "INR", "confidence": <0.0–1.0> } | null,
  "loan_tenure":    { "value": <number>, "unit": "months"|"years", "confidence": <0.0–1.0> } | null,
  "emi_amount":     { "value": <number>, "currency": "INR", "confidence": <0.0–1.0> } | null,
  "product_type":   { "value": "personal_loan"|"home_loan"|"car_loan"|"credit_card"|"insurance"|"fd"|"rd"|"mutual_fund", "confidence": <0.0–1.0> } | null,
  "pan_number":     { "value": "<5 uppercase letters><4 digits><1 uppercase letter>", "confidence": <0.0–1.0> } | null,
  "monthly_income": { "value": <number>, "currency": "INR", "confidence": <0.0–1.0> } | null,
  "interest_rate":  { "value": <number>, "unit": "percent", "confidence": <0.0–1.0> } | null,
  "call_intent":    { "value": "loan_enquiry"|"complaint"|"data_validation"|"emi_payment"|"collections"|"general_enquiry", "confidence": <0.0–1.0> } | null
}

Rules:
- All monetary values are in INR
- PAN format: exactly 5 uppercase letters + 4 digits + 1 uppercase letter (e.g. ABCDE1234F)
- Tenure in months unless caller explicitly says "saal" / "year" — then use "years"
- Confidence reflects how clearly the entity was stated (1.0 = explicit, 0.5 = inferred)
- Return ONLY the JSON object, no explanation`;

async function extractEntities(transcript, signal) {
  const tracker = new LatencyTracker();
  tracker.start('extraction');

  let raw;
  try {
    const response = await openai.chat.completions.create(
      {
        model: config.llmModel,
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: `Extract entities from this transcript:\n\n${transcript}` },
        ],
      },
      { signal }
    );

    raw = JSON.parse(response.choices[0].message.content);
  } catch (err) {
    const ms = tracker.end('extraction');
    if (err.name === 'AbortError') throw err;
    logger.error('entity extraction failed', { error: err.message, ms });
    throw new Error(`Entity extraction failed: ${err.message}`);
  }

  const ms = tracker.end('extraction');

  let entities;
  try {
    entities = EntitiesSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      logger.warn('entity schema validation failed — returning raw', { issues: err.issues });
      entities = raw;
    } else {
      throw err;
    }
  }

  logger.info('entities extracted', { extraction_ms: ms });
  return { entities, extraction_ms: ms };
}

module.exports = { extractEntities };
