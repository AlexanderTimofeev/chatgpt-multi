const test = require('node:test');
const assert = require('node:assert/strict');
const { domGenerationAttributes } = require('../src/lib/generation-signal.js');

test('serializes generation state for shared DOM bridge', () => {
  assert.deepEqual(domGenerationAttributes(true, 'abc', 7), {
    state: 'generating',
    convId: 'abc',
    seq: '7'
  });
  assert.deepEqual(domGenerationAttributes(false, null, 8), {
    state: 'idle',
    convId: '',
    seq: '8'
  });
});
