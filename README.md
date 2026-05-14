# VoiceIQ-BFSI

Real-time Hinglish financial entity extraction from voice calls.

Takes a noisy, code-switched Hindi-English (Hinglish) voice transcript, corrects STT errors, and returns structured financial entities — loan amounts, EMIs, PAN numbers, product types — as validated JSON with confidence scores. Built to mirror the core pipeline problem in Indian BFSI voice automation.

---

## Results

### Entity Extraction Accuracy  _(evaluated on 25 Hinglish BFSI call snippets)_

| Entity | Precision | Recall | F1 |
|---|---|---|---|
| loan_amount | 100.0% | 85.7% | 92.3% |
| loan_tenure | 72.7% | 100.0% | 84.2% |
| emi_amount | 100.0% | 60.0% | 75.0% |
| product_type | 100.0% | 95.2% | 97.6% |
| pan_number | 100.0% | 100.0% | 100.0% |
| monthly_income | 100.0% | 100.0% | 100.0% |
| interest_rate | 100.0% | 100.0% | 100.0% |
| call_intent | 100.0% | 68.0% | 81.0% |
| **Overall field accuracy** | | | **92.0%** |
| **Macro F1** | | | **91.3%** |

### STT Correction Impact

| | Accuracy |
|---|---|
| Clean transcripts (no STT errors) | 92.5% |
| Noisy transcripts + STT corrector | 92.0% |
| Delta | -0.5% (within noise margin) |

GPT-4o-mini handles Hinglish phonetic noise robustly without explicit correction — the -0.5% delta is within measurement noise across 25 samples. The corrector provides a safety net for edge cases.

### Pipeline Latency

| Stage | P50 | P90 | P99 |
|---|---|---|---|
| Combined processing | 4828ms | 6457ms | 10184ms |

> Latency is bounded by GPT-4o-mini API round-trip time (~3–6s), not by our pipeline code. In a production deployment, this would be replaced by a self-hosted or fine-tuned model to hit the sub-900ms target. The architecture is designed for that swap — the `processor.js` module is the only component that changes.

---

## Sample Output

```bash
curl -X POST http://localhost:3000/api/extract \
  -H 'Content-Type: application/json' \
  -d '{"transcript": "main teen lakh ka personal lon lena chahta hoon barah mahne ke liye meri salary fifty haazar hai"}'
```

```json
{
  "session_id": "a3f1c2d4-...",
  "corrected_transcript": "main teen lakh ka personal loan lena chahta hoon barah mahine ke liye meri salary fifty hazaar hai",
  "entities": {
    "loan_amount":    { "value": 300000, "currency": "INR", "confidence": 0.98 },
    "loan_tenure":    { "value": 12, "unit": "months",      "confidence": 0.96 },
    "emi_amount":     null,
    "product_type":   { "value": "personal_loan",           "confidence": 0.99 },
    "pan_number":     null,
    "monthly_income": { "value": 50000, "currency": "INR",  "confidence": 0.95 },
    "interest_rate":  null,
    "call_intent":    { "value": "loan_enquiry",            "confidence": 0.97 }
  },
  "latency": {
    "stt_ms": 0,
    "processing_ms": 3241,
    "total_ms": 3241
  }
}
```

---

## Architecture

```
Voice call transcript
        │
        ▼
┌─────────────────────────────┐
│  Unified Processor          │  Single GPT-4o-mini call
│                             │  ├── STT error correction
│  processor.js               │  │   "lon"→"loan", "parsonal"→"personal"
│                             │  └── Financial entity extraction
│                             │      Hindi number words → numeric values
│                             │      Zod schema validation + confidence scores
└──────────────┬──────────────┘
               │ corrected transcript + validated JSON
               ▼
┌─────────────────────────────┐
│  Session Store              │  MongoDB — optional, degrades gracefully
└──────────────┬──────────────┘
               │
               ▼
          JSON response
          + latency breakdown
```

Barge-in supported: `POST /api/barge-in` with a `session_id` cancels the in-flight LLM call via `AbortController`.

---

## Quickstart

**Prerequisites:** Docker Desktop + OpenAI API key

```bash
git clone https://github.com/PavithraRavichandiran/voiceiq-bfsi
cd voiceiq-bfsi
cp .env.example .env        # add your OPENAI_API_KEY
docker compose up
```

Server starts on `http://localhost:3000`. Latency dashboard at the same URL.

### Without Docker

```bash
npm install
cp .env.example .env        # add your OPENAI_API_KEY
npm start
```

### Run the accuracy benchmark

```bash
# requires Python 3.x, server must be running
python eval/evaluate.py
```

Prints per-entity precision/recall, overall accuracy, and P50/P90/P99 latency across all 25 test cases.

---

## API Reference

### `POST /api/extract`

```json
{
  "transcript": "string — raw Hinglish voice transcript",
  "session_id": "string — optional, auto-generated if absent"
}
```

Returns corrected transcript, extracted entities with confidence scores, and pipeline latency.

### `POST /api/barge-in`

```json
{ "session_id": "string" }
```

Cancels the in-flight LLM call for that session — simulates new audio interrupting the current call.

### `GET /api/stats`  _(Server-Sent Events)_

Streams latency percentile stats every 2 seconds. Consumed by the live dashboard.

---

## Entity Reference

| Entity | Example input | Output |
|---|---|---|
| `loan_amount` | "teen lakh ka loan" | `{ value: 300000, currency: "INR" }` |
| `loan_tenure` | "24 mahine ke liye" | `{ value: 24, unit: "months" }` |
| `emi_amount` | "EMI paanch hazaar" | `{ value: 5000, currency: "INR" }` |
| `product_type` | "personal loan chahiye" | `"personal_loan"` |
| `pan_number` | "PAN ABCDE1234F" | `"ABCDE1234F"` |
| `monthly_income` | "salary 45000 hai" | `{ value: 45000, currency: "INR" }` |
| `interest_rate` | "10 percent byaaj" | `{ value: 10, unit: "percent" }` |
| `call_intent` | inferred from context | `"loan_enquiry"` |

---

## Project Structure

```
voiceiq-bfsi/
├── src/
│   ├── pipeline/
│   │   ├── processor.js        # Unified STT correction + entity extraction
│   │   ├── errorCorrector.js   # Standalone STT corrector (modular)
│   │   ├── entityExtractor.js  # Standalone entity extractor (modular)
│   │   ├── sessionStore.js     # MongoDB session persistence
│   │   └── schema.js           # Zod validation schema
│   ├── api/
│   │   ├── server.js
│   │   └── routes/
│   │       ├── pipeline.js     # POST /api/extract, POST /api/barge-in
│   │       └── dashboard.js    # GET /api/stats (SSE)
│   ├── config/index.js
│   └── utils/
│       ├── logger.js           # Structured JSON logger
│       └── latencyTracker.js   # Per-stage timing + percentile stats
├── eval/
│   ├── test_set.json           # 25 Hinglish BFSI snippets with ground truth
│   └── evaluate.py             # Accuracy + latency benchmark (stdlib only)
├── dashboard/
│   └── index.html              # Live latency dashboard (Chart.js + SSE)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```
