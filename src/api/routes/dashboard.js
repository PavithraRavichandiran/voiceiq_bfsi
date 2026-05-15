const { Router } = require('express');
const OpenAI = require('openai');
const config = require('../../config');
const { getStats } = require('../../utils/latencyTracker');
const logger = require('../../utils/logger');

const router = Router();
const openai = new OpenAI({ apiKey: config.openaiApiKey });

// SSE endpoint — streams live latency percentiles to the dashboard every 2s
router.get('/stats', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = () => {
    const stats = getStats();
    res.write(`data: ${JSON.stringify(stats)}\n\n`);
  };

  send();
  const interval = setInterval(send, 2000);
  req.on('close', () => clearInterval(interval));
});

// TTS endpoint — converts confirmation text to MP3 using OpenAI TTS
router.post('/tts', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text.trim(),
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    logger.info('tts generated', { chars: text.length, bytes: buffer.length });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    logger.error('tts failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router };
