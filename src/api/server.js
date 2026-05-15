const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const config = require('../config');
const logger = require('../utils/logger');
const { router: pipelineRouter } = require('./routes/pipeline');
const { router: dashboardRouter } = require('./routes/dashboard');
const { createDeepgramStream } = require('../pipeline/sttClient');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dashboard')));

app.use('/api', pipelineRouter);
app.use('/api', dashboardRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((err, _req, res, _next) => {
  logger.error('unhandled error', { error: err.message });
  res.status(500).json({ error: 'internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info(`VoiceIQ-BFSI listening on port ${config.port}`);
});

// WebSocket server for real-time Deepgram STT streaming
const wss = new WebSocketServer({ server, path: '/ws/stt' });

wss.on('connection', (ws) => {
  logger.info('stt websocket client connected');

  if (!config.deepgramApiKey || config.deepgramApiKey === 'your_deepgram_key_here') {
    ws.send(JSON.stringify({ type: 'error', message: 'DEEPGRAM_API_KEY not configured' }));
    ws.close();
    return;
  }

  const dgConnection = createDeepgramStream(
    (transcript) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'transcript', ...transcript }));
      }
    },
    (errMsg) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: errMsg }));
      }
    }
  );

  ws.on('message', (audioChunk, isBinary) => {
    logger.debug('audio chunk received', { bytes: audioChunk.length, isBinary });
    try { dgConnection.send(audioChunk); } catch (_) {}
  });

  ws.on('close', () => {
    logger.info('stt websocket client disconnected');
    try { dgConnection.finish(); } catch (_) {}
  });
});

module.exports = app;
