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

test('app page uses the SVG favicon so browser tabs stay crisp on HiDPI displays', () => {
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  assert.match(html, /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="icons\/icon\.svg"\s*\/?>/);
});

test('extension PNG icons preserve transparent rounded corners at every declared size', () => {
  for (const size of [16, 32, 48, 128]) {
    const info = readPngInfo(path.join(root, `icons/icon${size}.png`));
    assert.deepEqual(
      info,
      { width: size, height: size, hasTransparency: true },
      `icon${size}.png must be ${size}x${size} and contain transparency`
    );
  }
});
