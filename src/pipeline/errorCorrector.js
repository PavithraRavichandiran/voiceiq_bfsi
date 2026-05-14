const OpenAI = require('openai');
const config = require('../config');
const { LatencyTracker } = require('../utils/latencyTracker');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM_PROMPT = `You are an STT (Speech-to-Text) error correction engine for Indian BFSI voice call transcripts.

Transcripts are in Hinglish (Hindi + English code-switching) and may contain:
- Phonetic substitutions: "lon" → "loan", "chek" → "check", "akaunt" → "account"
- Merged words: "personallon" → "personal loan", "homlon" → "home loan"
- Mishearing of financial terms: "EMI" as "emi", "PAN" as "pan", "CIBIL" as "sibil"
- Dropped or swapped syllables in Hindi: "chahta" as "chai", "lena" as "lna"
- Number word errors: "paansh" → "paanch", "lak" → "lakh", "hazar" → "hazaar"

Rules:
1. Correct STT errors while preserving the original meaning and intent exactly
2. Keep Hinglish structure intact — do NOT translate Hindi words to English
3. Preserve all numbers, amounts, and entity values — never change a figure
4. Return ONLY the corrected transcript — no explanation, no preamble, no quotes
5. If the transcript is already clean, return it unchanged`;

async function correctTranscript(rawTranscript, signal) {
  const tracker = new LatencyTracker();
  tracker.start('correction');

  try {
    const response = await openai.chat.completions.create(
      {
        model: config.llmModel,
        temperature: 0,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: rawTranscript },
        ],
      },
      { signal }
    );

    const corrected = response.choices[0].message.content.trim();
    const ms = tracker.end('correction');
    logger.info('transcript corrected', { correction_ms: ms });
    return { corrected, correction_ms: ms };
  } catch (err) {
    const ms = tracker.end('correction');
    if (err.name === 'AbortError') throw err;

    // Graceful fallback — pass raw transcript through rather than failing the pipeline
    logger.warn('STT correction failed, using raw transcript', { error: err.message, correction_ms: ms });
    return { corrected: rawTranscript, correction_ms: ms, fallback: true };
  }
}

module.exports = { correctTranscript };
