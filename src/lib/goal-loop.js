/*
 * Pure state machine for the goal loop. It decides *what to do next* given the
 * current phase and an incoming event; the controller performs the side effects
 * (send a prompt to a pane, post a Telegram report). Dependencies (prompt
 * builder, marker detector, report formatter) are injected so this is fully
 * unit-testable with no DOM/fetch.
 *
 * Flow:
 *   start()            -> send the goal to the executor      (phase: awaitingExecutor)
 *   onExecutorIdle(ans)-> send evaluator prompt to the agent (phase: awaitingAgent)
 *   onAgentIdle(ans)   -> marker?  finish                    (phase: done)
 *                         else max? abort                    (phase: aborted)
 *                         else send agent feedback to executor(phase: awaitingExecutor)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.CGPTMP = root.CGPTMP || {}).goalLoop = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createGoalSession(opts) {
    const o = opts || {};
    const goal = String(o.goal || '').trim();
    const marker = o.marker || 'GOAL REACHED GOAL';
    const maxIterations = Number.isFinite(o.maxIterations) ? o.maxIterations : 25;
    // Token saving: re-send the full instruction+goal to the agent only once the
    // agent chat's history has grown past this many characters since the last
    // full prompt; in between we send compact prompts. Infinity-ish default keeps
    // the loop usable in unit tests (full first, compact after).
    const reinjectChars = Number.isFinite(o.reinjectChars) ? o.reinjectChars : 120000;
    const buildEvaluatorPrompt = o.buildEvaluatorPrompt || ((g, a) => `GOAL:\n${g}\n\nANSWER:\n${a}`);
    const detectGoalMarker = o.detectGoalMarker || ((t, m) => t.includes(m));
    const formatReport = o.formatReport || (() => 'done');

    const state = Object.assign({
      phase: 'new', // new | awaitingExecutor | awaitingAgent | done | aborted
      goal,
      marker,
      iterations: 0, // agent->executor rounds
      agentMsgCount: 0, // messages sent from agent to executor
      startedAt: 0,
      lastAgentAnswer: '',
      agentSends: 0, // prompts sent to the agent chat
      agentContextChars: 0, // approx chars accumulated in the agent chat
      lastFullInjectChars: 0, // agentContextChars value at the last full re-inject
    }, o.initialState || {}); // rehydrate a persisted session

    function start(now = Date.now()) {
      if (state.phase !== 'new') return { type: 'noop' };
      state.phase = 'awaitingExecutor';
      state.startedAt = now;
      return { type: 'sendToExecutor', text: goal, initial: true };
    }

    function onExecutorIdle(finalAnswer) {
      if (state.phase !== 'awaitingExecutor') return { type: 'noop' };
      const answer = String(finalAnswer || '').trim();
      if (!answer) return { type: 'wait' }; // no final answer yet
      state.phase = 'awaitingAgent';
      // First send is always full; afterwards re-inject the full instruction only
      // once the agent chat has grown past the threshold since the last full one.
      const grown = state.agentContextChars - state.lastFullInjectChars;
      const full = state.agentSends === 0 || (reinjectChars > 0 && grown >= reinjectChars);
      const text = buildEvaluatorPrompt(goal, answer, marker, { full });
      if (full) state.lastFullInjectChars = state.agentContextChars;
      state.agentContextChars += text.length;
      state.agentSends += 1;
      return { type: 'sendToAgent', text, full };
    }

    function onAgentIdle(agentAnswer, now = Date.now()) {
      if (state.phase !== 'awaitingAgent') return { type: 'noop' };
      const answer = String(agentAnswer || '').trim();
      if (!answer) return { type: 'wait' };
      state.lastAgentAnswer = answer;
      state.agentContextChars += answer.length; // the agent's reply also grows its history
      state.iterations += 1;

      if (detectGoalMarker(answer, marker)) {
        state.phase = 'done';
        const report = formatReport({
          goal,
          durationMs: now - state.startedAt,
          messageCount: state.agentMsgCount,
        });
        return { type: 'finish', report, agentAnswer: answer };
      }
      if (state.iterations >= maxIterations) {
        state.phase = 'aborted';
        return { type: 'abort', reason: 'max-iterations', agentAnswer: answer };
      }
      state.agentMsgCount += 1;
      state.phase = 'awaitingExecutor';
      return { type: 'sendToExecutor', text: answer };
    }

    function abort(reason = 'manual') {
      if (state.phase === 'done' || state.phase === 'aborted') return { type: 'noop' };
      state.phase = 'aborted';
      return { type: 'abort', reason };
    }

    function snapshot() { return Object.assign({}, state); }

    return { state, start, onExecutorIdle, onAgentIdle, abort, snapshot };
  }

  return { createGoalSession };
});
