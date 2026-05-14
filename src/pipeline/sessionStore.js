const { MongoClient } = require('mongodb');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;
let db = null;

async function getDb() {
  if (db) return db;
  if (!config.mongodbUri) return null;

  try {
    client = new MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    db = client.db('voiceiq');
    logger.info('MongoDB connected');
    return db;
  } catch (err) {
    logger.warn('MongoDB unavailable — session persistence disabled', { error: err.message });
    return null;
  }
}

async function saveSession({ session_id, raw_transcript, corrected_transcript, stt_fallback, entities, latency }) {
  const database = await getDb();
  if (!database) return;

  try {
    await database.collection('sessions').insertOne({
      session_id,
      raw_transcript,
      corrected_transcript,
      stt_fallback: stt_fallback || false,
      entities,
      latency,
      created_at: new Date(),
    });
    logger.debug('session saved', { session_id });
  } catch (err) {
    logger.warn('session save failed', { session_id, error: err.message });
  }
}

async function getSession(session_id) {
  const database = await getDb();
  if (!database) return null;
  return database.collection('sessions').findOne({ session_id });
}

module.exports = { saveSession, getSession };
