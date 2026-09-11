(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CGPTMP = root.CGPTMP || {}).aiFinishedBridge = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const PROTOCOL_VERSION = 1;
  function normalizeExtensionId(value) {
    const id = String(value || '').trim().toLowerCase();
    return /^[a-p]{32}$/.test(id) ? id : '';
  }
  function normalizeFocusRequest(message, senderId, configuredAiFinishedId) {
    if (!message || message.type !== 'ai-finished:multi-focus-pane' || message.protocolVersion !== PROTOCOL_VERSION) return null;
    const sender = normalizeExtensionId(senderId);
    const configured = normalizeExtensionId(configuredAiFinishedId);
    if (!sender || !configured || sender !== configured) return null;
    const paneId = String(message.paneId || '').trim();
    if (!paneId || paneId.length > 128) return null;
    return { paneId };
  }
  function focusWorkspaceSnapshot(snapshot, paneId) {
    const id = String(paneId || '').trim();
    if (!snapshot || !Array.isArray(snapshot.panes) || !id) return null;
    if (!snapshot.panes.some((pane) => pane && pane.id === id)) return null;
    return { ...snapshot, focusedId: id };
  }
  function createBridge({ sendExternal, getExtensionId }) {
    const paneStates = new Map();
    async function send(message) {
      const extensionId = normalizeExtensionId(getExtensionId && getExtensionId());
      if (!extensionId) return { ok: false, sent: false, error: 'invalid-extension-id' };
      try {
        const response = await sendExternal(extensionId, message);
        return { ...(response || {}), ok: response?.ok !== false, sent: true };
      } catch (error) {
        return { ok: false, sent: false, error: String(error?.message || error || 'send-failed') };
      }
    }
    async function pair() {
      return send({ type: 'ai-finished:multi-pair', protocolVersion: PROTOCOL_VERSION });
    }
    async function observePaneGeneration(input) {
      const paneId = String(input?.paneId || '').trim().slice(0, 128);
      if (!paneId || typeof input?.generating !== 'boolean') return { ok: false, sent: false, error: 'invalid-generation-state' };
      const previous = paneStates.get(paneId);
      const next = input.generating;
      if (previous === undefined && next === false) {
        paneStates.set(paneId, false);
        return { ok: true, sent: false, ignored: 'initial-idle' };
      }
      if (previous === next) return { ok: true, sent: false, ignored: 'duplicate-state' };
      paneStates.set(paneId, next);
      return send({
        type: 'ai-finished:multi-generation',
        protocolVersion: PROTOCOL_VERSION,
        paneId,
        generating: next,
        convId: input.convId == null ? null : String(input.convId).slice(0, 160),
        title: String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        url: String(input.url || '').slice(0, 1000),
        focused: Boolean(input.focused)
      });
    }
    function clearPane(paneId) { paneStates.delete(String(paneId || '')); }
    return { pair, observePaneGeneration, clearPane };
  }
  return {
    PROTOCOL_VERSION,
    normalizeExtensionId,
    normalizeFocusRequest,
    focusWorkspaceSnapshot,
    createBridge
  };
});