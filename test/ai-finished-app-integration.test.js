const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('workspace forwards cgptmp generation with resolved pane identity', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  assert.match(source, /aiFinishedBridge\.observePaneGeneration\(\{/);
  assert.match(source, /paneId:\s*pane\.id/);
  assert.match(source, /generating:\s*d\.generating/);
  assert.match(source, /focused:\s*state\.focusedId === pane\.id/);
});

test('options loads bridge and exposes pairing control', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');
  assert.match(html, /src="src\/lib\/ai-finished-bridge\.js"/);
  assert.match(html, /src="options\.js"/);
  assert.match(source, /button\.id = 'pairAiFinished'/);
  assert.match(source, /await pairingBridge\.pair\(\)/);
});