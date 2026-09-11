const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function pngInfo(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return {
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
    colorType: b[25]
  };
}

test('icon assets come from a vector master and use RGBA PNGs at exact sizes', () => {
  const root = path.join(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'icons', 'icon.svg'), 'utf8');
  assert.match(svg, /<svg/);
  assert.match(svg, /rx=/);

  for (const size of [16, 32, 48, 128]) {
    const info = pngInfo(path.join(root, 'icons', `icon${size}.png`));
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    assert.equal(info.colorType, 6, `icon${size}.png must be RGBA`);
  }
});
