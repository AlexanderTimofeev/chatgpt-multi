const test = require('node:test');
const assert = require('node:assert/strict');
let api = null;
try { api = require('../src/lib/ai-finished-bridge.js'); } catch {}
const VALID_ID = 'abcdefghijklmnopabcdefghijklmnop';
const OTHER_ID = 'ponmlkjihgfedcbaponmlkjihgfedcba';

test('normalizes only valid Chrome extension ids', () => {
  assert.ok(api);
  assert.equal(api.normalizeExtensionId(`  ${VALID_ID.toUpperCase()}  `), VALID_ID);
  assert.equal(api.normalizeExtensionId('abc'), '');
  assert.equal(api.normalizeExtensionId('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'), '');
});
test('pair sends the protocol message to configured receiver', async () => {
  const calls = [];
  const bridge = api.createBridge({ getExtensionId: () => VALID_ID, sendExternal: async (id, message) => { calls.push([id, message]); return { ok: true, paired: true }; }});
  const result = await bridge.pair();
  assert.deepEqual(calls, [[VALID_ID, { type: 'ai-finished:multi-pair', protocolVersion: 1 }]]);
  assert.equal(result.ok, true);
});
test('initial idle is ignored and true to false emits lifecycle once', async () => {
  const calls = [];
  const bridge = api.createBridge({ getExtensionId: () => VALID_ID, sendExternal: async (id, message) => { calls.push([id, message]); return { ok: true }; }});
  assert.equal((await bridge.observePaneGeneration({ paneId: 'p1', generating: false })).sent, false);
  assert.equal((await bridge.observePaneGeneration({ paneId: 'p1', generating: true, convId: 'c1', title: 'One', url: 'https://chatgpt.com/c/1', focused: true })).sent, true);
  assert.equal((await bridge.observePaneGeneration({ paneId: 'p1', generating: true })).sent, false);
  assert.equal((await bridge.observePaneGeneration({ paneId: 'p1', generating: false, convId: 'c1', title: 'One', url: 'https://chatgpt.com/c/1', focused: false })).sent, true);
  assert.equal((await bridge.observePaneGeneration({ paneId: 'p1', generating: false })).sent, false);
  assert.deepEqual(calls.map(([,m]) => m.generating), [true, false]);
});
test('two panes keep independent transition state', async () => {
  const messages = [];
  const bridge = api.createBridge({ getExtensionId: () => VALID_ID, sendExternal: async (_id, message) => { messages.push(message); return { ok: true }; }});
  await bridge.observePaneGeneration({ paneId: 'a', generating: true });
  await bridge.observePaneGeneration({ paneId: 'b', generating: false });
  await bridge.observePaneGeneration({ paneId: 'b', generating: true });
  await bridge.observePaneGeneration({ paneId: 'a', generating: false });
  await bridge.observePaneGeneration({ paneId: 'b', generating: false });
  assert.deepEqual(messages.map(m => [m.paneId, m.generating]), [['a',true],['b',true],['a',false],['b',false]]);
});
test('invalid receiver or send failure is non-fatal', async () => {
  const disabled = api.createBridge({ getExtensionId: () => 'bad', sendExternal: async () => ({ ok: true }) });
  assert.equal((await disabled.pair()).ok, false);
  assert.equal((await disabled.observePaneGeneration({ paneId: 'a', generating: true })).sent, false);
  const failing = api.createBridge({ getExtensionId: () => VALID_ID, sendExternal: async () => { throw new Error('no receiver'); } });
  const result = await failing.observePaneGeneration({ paneId: 'a', generating: true });
  assert.equal(result.sent, false);
  assert.match(result.error, /no receiver/);
});

test('focus command is trusted only from configured AI Finished id', () => {
  assert.equal(typeof api.normalizeFocusRequest, 'function');
  assert.deepEqual(
    api.normalizeFocusRequest({ type: 'ai-finished:multi-focus-pane', protocolVersion: 1, paneId: 'pane-1' }, VALID_ID, VALID_ID),
    { paneId: 'pane-1' }
  );
  assert.equal(api.normalizeFocusRequest({ type: 'ai-finished:multi-focus-pane', protocolVersion: 1, paneId: 'pane-1' }, OTHER_ID, VALID_ID), null);
  assert.equal(api.normalizeFocusRequest({ type: 'ai-finished:multi-focus-pane', protocolVersion: 2, paneId: 'pane-1' }, VALID_ID, VALID_ID), null);
});

test('workspace snapshot can be focused on an existing pane only', () => {
  assert.equal(typeof api.focusWorkspaceSnapshot, 'function');
  const snapshot = { focusedId: 'a', panes: [{ id: 'a' }, { id: 'b' }] };
  assert.deepEqual(api.focusWorkspaceSnapshot(snapshot, 'b'), { focusedId: 'b', panes: [{ id: 'a' }, { id: 'b' }] });
  assert.equal(api.focusWorkspaceSnapshot(snapshot, 'missing'), null);
  assert.equal(snapshot.focusedId, 'a');
});
