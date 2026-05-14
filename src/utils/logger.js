const config = require('../config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[config.logLevel] ?? LEVELS.info;

function log(level, message, meta = {}) {
  if (LEVELS[level] > current) return;
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta }) + '\n'
  );
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
