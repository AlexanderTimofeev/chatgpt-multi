/*
 * Agent runtime (ISOLATED, runs inside chatgpt.com pane iframes). Bridges the
 * workspace controller (app.js, parent window) to a pane: executes commands
 * (send a prompt, read the final answer, disable memory, start a new chat) and
 * reports generation-state changes so the controller knows when a turn ended.
 *
 * The controller is trusted (it's the extension page that hosts this iframe),
 * so commands are accepted only from window.parent.
 */
(function () {
  if (window.parent === window) return; // only meaningful as an embedded pane
  const A = window.CGPTMP && window.CGPTMP.chatgptAdapter;
  const GA = window.CGPTMP && window.CGPTMP.goalAgent;
  const CP = window.CGPTMP && window.CGPTMP.chatPreview;
  if (!A || !GA) { console.warn('[CGPTMP] agent-runtime: deps missing'); return; }

  function reply(requestId, payload) {
    try { window.parent.postMessage(Object.assign({ type: 'cgptmp:reply', requestId }, payload), '*'); } catch {}
  }

  async function handle(cmd, msg) {
    switch (cmd) {
      case 'status':
        return { generating: A.isGenerating(), convId: A.convId() };
      case 'send': {
        const ok = await A.sendPrompt(String(msg.text || ''));
        return { ok };
      }
      case 'stop':
        return { ok: A.stop ? A.stop() : false };
      case 'queueStatus': {
        const q = window.CGPTMP && window.CGPTMP.queueFeature;
        if (q && q.status) return q.status();
        return { ok: true, items: [], paused: false, length: 0, unavailable: true };
      }
      case 'clearQueue': {
        const q = window.CGPTMP && window.CGPTMP.queueFeature;
        if (q && q.clear) return q.clear();
        return { ok: true, cleared: 0, unavailable: true };
      }
      case 'getFinalAnswer': {
        try {
          const data = await A.fetchConversation(msg.convId);
          const info = GA.answerInfo ? GA.answerInfo(data) : { text: GA.extractFinalAnswer(data), createTime: 0, complete: true };
          return { ok: true, finalAnswer: info.text, createTime: info.createTime, complete: info.complete, convId: A.convId() };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'patchMemory': {
        const features = (msg.features && msg.features.length) ? msg.features : GA.MEMORY_DISABLE_FEATURES;
        const results = {};
        for (const f of features) {
          try { results[f] = await A.patchSetting(f, 'false'); } catch { results[f] = false; }
        }
        return { ok: true, results };
      }
      case 'chatStatus': {
        const out = Object.assign({ generating: A.isGenerating(), convId: A.convId(), title: document.title, url: location.href, userAt: 0, assistantAt: 0 }, A.genState ? A.genState() : {});
        try {
          if (CP && A.convId()) { const data = await A.fetchConversation(); const a = CP.lastActivity(data); out.userAt = a.userAt; out.assistantAt = a.assistantAt; }
        } catch {}
        return out;
      }
      case 'newChat':
        location.assign('/');
        return { ok: true };
      default:
        return { ok: false, error: 'unknown-cmd' };
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const msg = e.data;
    if (!msg || msg.type !== 'cgptmp:cmd' || !msg.cmd) return;
    Promise.resolve(handle(msg.cmd, msg)).then((res) => reply(msg.requestId, res));
  });

  // Report generation-state changes. To avoid firing on brief streaming gaps
  // (and the window between the stop button vanishing and image-gen finishing,
  // or between two tool calls in a custom GPT), a transition to "idle" must hold
  // for several consecutive polls before we emit. The hold is configurable via
  // genIdleConfirmMs (mirrored into the <html> dataset by settings-bridge) so
  // tool-heavy custom GPTs can use a longer, safer threshold.
  const POLL_MS = 600;
  function idleConfirmPolls() {
    const ms = Number(document.documentElement.dataset.cgptmpGenIdleMs) || 1800;
    return Math.max(2, Math.round(ms / POLL_MS));
  }
  let reported = null; // last value we told the parent
  let idleStreak = 0;
  setInterval(() => {
    const gen = A.isGenerating();
    if (gen) idleStreak = 0; else idleStreak++;
    const stable = gen ? true : idleStreak >= idleConfirmPolls();
    const value = gen ? true : (stable ? false : reported);
    if (value !== reported && value !== null) {
      reported = value;
      const detail = A.genState ? A.genState() : {};
      try { window.parent.postMessage(Object.assign({ type: 'cgptmp:gen', generating: value, convId: A.convId() }, detail), '*'); } catch {}
    }
  }, POLL_MS);
})();
