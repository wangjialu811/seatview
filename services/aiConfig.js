// Resolve credentials on the server only. OpenRouter names also support the
// existing OPENAI_API_KEY, so older local configuration remains compatible.
module.exports = function aiConfig() {
  const openRouter = Boolean(process.env.OPENROUTER_BASE_URL || process.env.OPENROUTER_MODEL || process.env.OPENROUTER_API_KEY);
  return {
    provider: openRouter ? 'OpenRouter' : 'OpenAI compatible',
    baseUrl: (openRouter ? process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1' : process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: openRouter ? process.env.OPENROUTER_MODEL || 'inclusionai/ling-3.1-flash' : process.env.OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: openRouter ? process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY : process.env.OPENAI_API_KEY
  };
};
