const WebSocket = require('ws');
const config = require('../config');
const logger = require('../utils/logger');

const DEEPGRAM_URL =
  'wss://api.deepgram.com/v1/listen' +
  '?model=nova-2' +
  '&language=hi' +
  '&smart_format=true' +
  '&interim_results=true' +
  '&endpointing=500' +
  '&utterance_end_ms=2000' +
  '&vad_events=true' +
  '&encoding=linear16' +
  '&sample_rate=16000' +
  '&channels=1';

function createDeepgramStream(onTranscript, onError) {
  const ws = new WebSocket(DEEPGRAM_URL, {
    headers: { Authorization: `Token ${config.deepgramApiKey}` },
  });

  ws.on('open', () => {
    logger.info('deepgram connection open');
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'Results') {
        const alt = msg.channel?.alternatives?.[0];
        if (alt?.transcript) {
          onTranscript({
            text:    alt.transcript,
            isFinal: msg.is_final,
            speech:  msg.speech_final,
          });
        }
      }

      if (msg.type === 'Error') {
        onError(msg.description || 'Deepgram error');
      }
    } catch (_) {}
  });

  ws.on('error', (err) => {
    logger.error('deepgram ws error', { error: err.message });
    onError(err.message);
  });

  ws.on('close', () => {
    logger.info('deepgram connection closed');
  });

  return {
    send: (chunk) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    },
    finish: () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'CloseStream' }));
        ws.close();
      }
    },
  };
}

module.exports = { createDeepgramStream };
