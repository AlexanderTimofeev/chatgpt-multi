const test = require('node:test');
const assert = require('node:assert/strict');

const { createGoalSession } = require('../src/lib/goal-loop.js');
const GA = require('../src/lib/goal-agent.js');

function make(extra) {
  return createGoalSession(Object.assign({
    goal: 'Build X',
    marker: GA.GOAL_MARKER,
    maxIterations: 3,
    buildEvaluatorPrompt: GA.buildEvaluatorPrompt,
    detectGoalMarker: GA.detectGoalMarker,
    formatReport: ({ goal, messageCount }) => `REPORT ${goal} ${messageCount}`,
  }, extra));
}

test('start sends the goal to the executor and arms the loop', () => {
  const s = make();
  const a = s.start(1000);
  assert.equal(a.type, 'sendToExecutor');
  assert.equal(a.text, 'Build X');
  assert.equal(a.initial, true);
  assert.equal(s.state.phase, 'awaitingExecutor');
});

test('start is a no-op when already running', () => {
  const s = make();
  s.start();
  assert.equal(s.start().type, 'noop');
});

test('executor idle -> evaluator prompt to the agent', () => {
  const s = make();
  s.start();
  const a = s.onExecutorIdle('here is my work');
  assert.equal(a.type, 'sendToAgent');
  assert.ok(a.text.includes('Build X'));
  assert.ok(a.text.includes('here is my work'));
  assert.equal(s.state.phase, 'awaitingAgent');
});

test('executor idle with empty answer waits (phase unchanged)', () => {
  const s = make();
  s.start();
  const a = s.onExecutorIdle('   ');
  assert.equal(a.type, 'wait');
  assert.equal(s.state.phase, 'awaitingExecutor');
});

test('agent feedback (no marker) goes back to the executor and counts a round', () => {
  const s = make();
  s.start();
  s.onExecutorIdle('work v1');
  const a = s.onAgentIdle('Missing: tests');
  assert.equal(a.type, 'sendToExecutor');
  assert.equal(a.text, 'Missing: tests');
  assert.equal(s.state.phase, 'awaitingExecutor');
  assert.equal(s.state.iterations, 1);
  assert.equal(s.state.agentMsgCount, 1);
});

test('agent marker -> finish with formatted report', () => {
  const s = make();
  s.start(0);
  s.onExecutorIdle('work');
  const a = s.onAgentIdle(GA.GOAL_MARKER, 1000);
  assert.equal(a.type, 'finish');
  assert.ok(a.report.includes('REPORT Build X'));
  assert.equal(s.state.phase, 'done');
});

test('aborts after max iterations', () => {
  const s = make({ maxIterations: 2 });
  s.start();
  // round 1
  s.onExecutorIdle('v1'); let a = s.onAgentIdle('missing a');
  assert.equal(a.type, 'sendToExecutor');
  // round 2 reaches the cap
  s.onExecutorIdle('v2'); a = s.onAgentIdle('missing b');
  assert.equal(a.type, 'abort');
  assert.equal(a.reason, 'max-iterations');
  assert.equal(s.state.phase, 'aborted');
});

test('events in the wrong phase are no-ops', () => {
  const s = make();
  assert.equal(s.onExecutorIdle('x').type, 'noop'); // before start
  s.start();
  assert.equal(s.onAgentIdle('x').type, 'noop'); // agent before executor
});

test('manual abort stops the loop; further events no-op', () => {
  const s = make();
  s.start();
  assert.equal(s.abort('manual').type, 'abort');
  assert.equal(s.state.phase, 'aborted');
  assert.equal(s.onExecutorIdle('x').type, 'noop');
});

test('first agent send is full; later sends go compact to save tokens', () => {
  const calls = [];
  const s = make({
    reinjectChars: 1e9, // effectively never re-inject after the first
    buildEvaluatorPrompt: (g, a, m, opts) => { calls.push(!!(opts && opts.full)); return `P:${a}`; },
  });
  s.start();
  s.onExecutorIdle('v1'); // -> agent (full)
  s.onAgentIdle('missing a'); // -> executor
  s.onExecutorIdle('v2'); // -> agent (compact)
  assert.deepEqual(calls, [true, false]);
});

test('re-injects a full prompt once history grows past the threshold', () => {
  const calls = [];
  const big = 'x'.repeat(500);
  const s = make({
    maxIterations: 10,
    reinjectChars: 300, // small threshold so the next round re-injects
    buildEvaluatorPrompt: (g, a, m, opts) => { calls.push(!!(opts && opts.full)); return big; },
  });
  s.start();
  s.onExecutorIdle('v1'); // full (sends `big`, 500 chars > 300)
  s.onAgentIdle('missing'); // executor
  s.onExecutorIdle('v2'); // grown > threshold -> full again
  assert.deepEqual(calls, [true, true]);
});

test('marker detection ignores the marker when only quoted in prose', () => {
  const s = make();
  s.start();
  s.onExecutorIdle('work');
  const a = s.onAgentIdle('Please output ' + GA.GOAL_MARKER + ' when ready, but not yet');
  assert.equal(a.type, 'sendToExecutor'); // not finished
});
