const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('service worker accepts trusted AI Finished focus commands', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
  assert.match(source, /onMessageExternal\.addListener/);
  assert.match(source, /normalizeFocusRequest/);
  assert.match(source, /focusWorkspaceSnapshot/);
  assert.match(source, /ai-finished:focus-pane/);
});

test('workspace applies live pane focus commands', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  assert.match(source, /message\?\.type !== 'ai-finished:focus-pane'/);
  assert.match(source, /focusPane\(message\.paneId\)/);
});
