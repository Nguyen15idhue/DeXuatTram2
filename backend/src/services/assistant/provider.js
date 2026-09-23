const gemini = require('./gemini');
const openrouter = require('./openrouter');

const PROVIDERS = [gemini, openrouter];

function available() {
  return PROVIDERS.filter((p) => p.isConfigured());
}

function get(name) {
  return PROVIDERS.find((p) => p.name === name) || null;
}

module.exports = { PROVIDERS, available, get };
