import assert from 'node:assert/strict';
import test from 'node:test';

import { AskChatWindow } from './ask-chat-window.js';
import { CONFIG, SETTINGS } from '../modules/config.js';

test('chat history is stored in a client-scoped object setting', () => {
  assert.equal(SETTINGS.CHAT_HISTORY.scope, 'client');
  assert.equal(SETTINGS.CHAT_HISTORY.default, '{}');
});

test('saving chat history waits for the client setting write', async () => {
  const writes = [];
  globalThis.game = {
    user: { id: 'player-1' },
    settings: {
      get(moduleId, key) {
        assert.equal(moduleId, CONFIG.MODULE_ID);
        if (key === SETTINGS.CHAT_HISTORY_ENABLED.key) return true;
        if (key === SETTINGS.CHAT_HISTORY.key) return '{}';
        if (key === SETTINGS.SELECTED_WORLD_ID.key) return 'world-1';
        throw new Error(`Unexpected setting read: ${key}`);
      },
      async set(moduleId, key, value) {
        await Promise.resolve();
        writes.push({ moduleId, key, value });
      },
    },
  };

  const chat = new AskChatWindow();
  chat._messages = [{ role: 'user', content: 'Hello' }];

  await chat._saveHistory();

  assert.deepEqual(writes, [
    {
      moduleId: CONFIG.MODULE_ID,
      key: SETTINGS.CHAT_HISTORY.key,
      value: JSON.stringify({
        'player-1:world-1': [{ role: 'user', content: 'Hello' }],
      }),
    },
  ]);
});
