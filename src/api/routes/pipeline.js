const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const { processTranscript } = require('../../pipeline/processor');
const { recordLatency } = require('../../utils/latencyTracker');
const { saveSession } = require('../../pipeline/sessionStore');
const logger = require('../../utils/logger');

const router = Router();

// In-flight AbortControllers keyed by session_id — used by barge-in endpoint
const activeControllers = new Map();

router.post('/extract', async (req, res) => {
  const { transcript, session_id } = req.body;

  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return res.status(400).json({ error: 'transcript is required and must be a non-empty string' });
  }

  const sessionId = session_id || uuidv4();
  const controller = new AbortController();
  activeControllers.set(sessionId, controller);

  const pipelineStart = Date.now();

  try {
    const { corrected_transcript, entities, processing_ms } = await processTranscript(
      transcript.trim(),
      controller.signal
    );

    const total_ms = Date.now() - pipelineStart;

    const latencyEntry = { correction_ms: 0, extraction_ms: processing_ms, total_ms };
    recordLatency(latencyEntry);

    saveSession({
      session_id:           sessionId,
      raw_transcript:       transcript.trim(),
      corrected_transcript,
      entities,
      latency:              latencyEntry,
    });

    logger.info('pipeline complete', { session_id: sessionId, total_ms });

    return res.json({
      session_id,
      corrected_transcript,
      entities,
      latency: {
        stt_ms:        0,
        processing_ms,
        total_ms,
      },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.info('pipeline aborted (barge-in)', { session_id: sessionId });
      return res.status(409).json({ error: 'pipeline cancelled by barge-in', session_id: sessionId });
    }

    logger.error('pipeline error', { session_id: sessionId, error: err.message });
    return res.status(500).json({ error: err.message });
  } finally {
    activeControllers.delete(sessionId);
  }
});

router.post('/barge-in', (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  const controller = activeControllers.get(session_id);
  if (!controller) return res.status(404).json({ error: 'no active pipeline for this session_id' });

  controller.abort();
  logger.info('barge-in triggered', { session_id });
  return res.json({ cancelled: true, session_id });
});

module.exports = { router, activeControllers };
