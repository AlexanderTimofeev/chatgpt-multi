const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('manifest and extension pages use the GPT-Multi icon set', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  const options = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');

  assert.equal(manifest.version, '0.1.6');
  for (const size of ['16','32','48','128']) {
    assert.equal(manifest.icons[size], `icons/icon${size}.png`);
    assert.equal(manifest.action.default_icon[size], `icons/icon${size}.png`);
  }
  assert.match(app, /rel="icon"[^>]+icons\/icon32\.png/);
  assert.match(options, /rel="icon"[^>]+icons\/icon32\.png/);
});
