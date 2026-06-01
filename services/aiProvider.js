const axios = require('axios');

const PROVIDERS = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
    docsUrl: 'https://platform.deepseek.com/api-keys'
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    envKey: 'GEMINI_API_KEY',
    docsUrl: 'https://aistudio.google.com/apikey'
  }
};

let activeProvider = process.env.ACTIVE_AI_PROVIDER || 'deepseek';
let apiKeys = {};

for (const [id, p] of Object.entries(PROVIDERS)) {
  if (process.env[p.envKey]) {
    apiKeys[id] = process.env[p.envKey];
  }
}

function getProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    models: p.models,
    defaultModel: p.defaultModel,
    configured: !!apiKeys[id],
    active: id === activeProvider,
    docsUrl: p.docsUrl
  }));
}

function getActiveProvider() {
  return activeProvider;
}

function setActiveProvider(id) {
  if (!PROVIDERS[id]) throw new Error(`Unknown provider: ${id}`);
  activeProvider = id;
}

function setApiKey(providerId, key) {
  if (!PROVIDERS[providerId]) throw new Error(`Unknown provider: ${providerId}`);
  apiKeys[providerId] = key;
}

function getApiKey(providerId) {
  return apiKeys[providerId] || '';
}

async function testConnection(providerId, model) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const key = apiKeys[providerId];
  if (!key) return { success: false, error: 'No API key configured', status: 'no_key' };

  try {
    if (providerId === 'deepseek') {
      const resp = await axios.post(provider.baseUrl, {
        model: model || provider.defaultModel,
        messages: [{ role: 'user', content: 'Reply with just: OK' }],
        max_tokens: 10
      }, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return { success: true, provider: providerId, model: model || provider.defaultModel, status: 'connected' };
    } else if (providerId === 'gemini') {
      const url = `${provider.baseUrl}/${model || provider.defaultModel}:generateContent?key=${key}`;
      const resp = await axios.post(url, {
        contents: [{ parts: [{ text: 'Reply with just: OK' }] }],
        generationConfig: { maxOutputTokens: 10 }
      }, { timeout: 15000 });
      return { success: true, provider: providerId, model: model || provider.defaultModel, status: 'connected' };
    }
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { success: false, provider: providerId, error: msg, status: 'error' };
  }
}

async function callAI(prompt, systemPrompt, options = {}) {
  const provider = PROVIDERS[activeProvider];
  if (!provider) throw new Error(`Active provider "${activeProvider}" not found`);
  const key = apiKeys[activeProvider];
  if (!key) return null;

  const model = options.model || provider.defaultModel;
  const maxTokens = options.maxTokens || 2048;
  const temperature = options.temperature ?? 0.7;

  try {
    if (activeProvider === 'deepseek') {
      const resp = await axios.post(provider.baseUrl, {
        model, messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens, temperature
      }, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 60000
      });
      return resp.data.choices[0].message.content;
    } else if (activeProvider === 'gemini') {
      const url = `${provider.baseUrl}/${model}:generateContent?key=${key}`;
      const contents = [];
      if (systemPrompt) {
        contents.push({ role: 'user', parts: [{ text: systemPrompt + '\n\n' + prompt }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: prompt }] });
      }
      const resp = await axios.post(url, {
        contents, generationConfig: { maxOutputTokens: maxTokens, temperature }
      }, { timeout: 60000 });
      return resp.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  } catch (err) {
    console.error(`${activeProvider} API error:`, err.response?.data || err.message);
    return null;
  }
}

module.exports = { PROVIDERS, getProviders, getActiveProvider, setActiveProvider, setApiKey, getApiKey, testConnection, callAI };
