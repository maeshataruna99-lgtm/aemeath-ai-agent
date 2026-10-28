'use strict';

// Registry of chat providers. To add one, write a module that returns
// { id, name, models, defaultModel, keyUrl, send({ apiKey, model, messages, signal }) }
// and list it here.

const { createDeepSeekProvider } = require('./deepseek');
const { createGeminiProvider } = require('./gemini');

function createProviders(options) {
  const list = [createDeepSeekProvider(options), createGeminiProvider(options)];
  const byId = new Map(list.map((provider) => [provider.id, provider]));
  return {
    list: list,
    get: (id) => byId.get(id) || null,
    defaultId: list[0].id,
  };
}

module.exports = { createProviders };
