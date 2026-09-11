const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readPngInfo(filePath) {
  const png = fs.readFileSync(filePath);
  const signature = png.subarray(0, 8).toString('hex');
  assert.equal(signature, '89504e470d0a1a0a', `${path.basename(filePath)} must be a PNG`);

  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  const chunks = [];

  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    chunks.push(type);
    offset += 12 + length;
    if (type === 'IEND') break;
  }

  const hasTransparency = colorType === 4 || colorType === 6 || chunks.includes('tRNS');
  return { width, height, hasTransparency };
}

test('manifest wires the ChatGPT icon set for the toolbar and extension card', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const size of [16, 32, 48, 128]) {
    const file = `icons/chatgpt-${size}.png`;
    assert.equal(manifest.icons[size], file);
    assert.equal(manifest.action.default_icon[size], file);
    assert.ok(fs.statSync(path.join(root, file)).size > 0, `${file} must exist`);
  }
});

test('extension PNG icons preserve transparent rounded corners at every declared size', () => {
  for (const size of [16, 32, 48, 128]) {
    const info = readPngInfo(path.join(root, `icons/chatgpt-${size}.png`));
    assert.deepEqual(
      info,
      { width: size, height: size, hasTransparency: true },
      `chatgpt-${size}.png must be ${size}x${size} and contain transparency`
    );
  }
});

test('extension pages use the SVG favicon so browser tabs stay crisp on HiDPI displays', () => {
  for (const page of ['app.html', 'options.html', 'sidepanel.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="icons\/chatgpt-mark\.svg"\s*\/?>/, `${page} must link the SVG favicon`);
  }
});
