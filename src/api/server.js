const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { router: pipelineRouter } = require('./routes/pipeline');
const { router: dashboardRouter } = require('./routes/dashboard');

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

app.listen(config.port, () => {
  logger.info(`VoiceIQ-BFSI listening on port ${config.port}`);
});

module.exports = app;
