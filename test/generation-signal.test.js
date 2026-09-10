const test = require('node:test');
const assert = require('node:assert/strict');
const { makeGenerationSignal } = require('../src/lib/generation-signal.js');

test('generation signal exposes a stable cgptmp bridge payload', () => {
  assert.deepEqual(
    makeGenerationSignal(true, 'abc-123', { stop: true, image: false }),
    {
      source: 'cgptmp',
      type: 'cgptmp:gen',
      generating: true,
      convId: 'abc-123',
      stop: true,
      image: false
    }
  );
});

test('generation signal normalizes generating to boolean', () => {
  const signal = makeGenerationSignal(1, null);
  assert.equal(signal.generating, true);
  assert.equal(signal.convId, null);
});
