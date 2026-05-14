const HISTORY_LIMIT = 500;

const history = [];

class LatencyTracker {
  constructor() {
    this._marks = {};
  }

  start(stage) {
    this._marks[stage] = Date.now();
  }

  end(stage) {
    if (!this._marks[stage]) return 0;
    const ms = Date.now() - this._marks[stage];
    this._marks[stage + '_ms'] = ms;
    return ms;
  }

  summary() {
    const out = {};
    for (const [key, val] of Object.entries(this._marks)) {
      if (key.endsWith('_ms')) out[key] = val;
    }
    return out;
  }
}

function recordLatency(entry) {
  history.push(entry);
  if (history.length > HISTORY_LIMIT) history.shift();
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function getStats() {
  if (!history.length) return null;

  const stages = ['correction_ms', 'extraction_ms', 'total_ms'];
  const stats = {};

  for (const stage of stages) {
    const values = history.map(r => r[stage]).filter(v => typeof v === 'number');
    stats[stage] = {
      p50: percentile(values, 50),
      p90: percentile(values, 90),
      p99: percentile(values, 99),
      count: values.length,
    };
  }

  return stats;
}

module.exports = { LatencyTracker, recordLatency, getStats };
