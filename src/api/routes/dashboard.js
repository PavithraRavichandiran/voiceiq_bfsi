const { Router } = require('express');
const { getStats } = require('../../utils/latencyTracker');

const router = Router();

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

module.exports = { router };
