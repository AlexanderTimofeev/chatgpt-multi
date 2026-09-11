const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('AI Finished ID, Pair button and status are rendered in the same settings group', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'options.js'), 'utf8');

  assert.doesNotMatch(html, /<h2>AI Finished connection<\/h2>/);
  assert.match(js, /title:\s*'AI Finished'/);
  assert.match(js, /key:\s*'aiFinishedExtensionId'/);
  assert.match(js, /type:\s*'aiFinishedPair'/);
  assert.match(js, /id\s*=\s*'pairAiFinished'/);
  assert.match(js, /id\s*=\s*'aiFinishedStatus'/);
});