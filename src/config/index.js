require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  mongodbUri: process.env.MONGODB_URI || '',
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  logLevel: process.env.LOG_LEVEL || 'info',
};
