(function (root, factory) {
  const api = factory();
  root.CGPTMP = root.CGPTMP || {};
  root.CGPTMP.generationSignal = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis, function () {
  'use strict';

  function makeGenerationSignal(generating, convId, detail = {}) {
    return {
      source: 'cgptmp',
      type: 'cgptmp:gen',
      generating: Boolean(generating),
      convId: convId ?? null,
      ...detail
    };
  }

  return { makeGenerationSignal };
});
