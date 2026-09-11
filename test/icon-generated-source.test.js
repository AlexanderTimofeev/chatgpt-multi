const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

test('GPT-Multi icon set remains wired for toolbar and tab favicon assets', () => {
  assert.equal(manifest.version, '0.1.7');
  for (const size of ['16', '32', '48', '128']) {
    assert.equal(manifest.icons[size], `icons/icon${size}.png`);
    assert.equal(manifest.action.default_icon[size], `icons/icon${size}.png`);
    assert.ok(fs.statSync(path.join(__dirname, '..', `icons/icon${size}.png`)).size > 0);
  }
});
