/*
 * Pure logic for the "goal agent" loop.
 *
 * An executor chat works on a task; after each executor turn we take ONLY the
 * final user-facing text it produced (skipping tool calls + reasoning) and ask
 * a separate memory-disabled "agent" chat to judge whether the goal is reached.
 * The agent either lists what's missing (fed back to the executor) or emits an
 * exact marker meaning done.
 *
 * No DOM/fetch here — just parsing + prompt building, so it is unit-tested.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.CGPTMP = root.CGPTMP || {}).goalAgent = factory();
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GOAL_MARKER = 'GOAL REACHED GOAL';

  // Account settings to PATCH to false so the agent chat has no memory.
  // (PATCH /backend-api/settings/account_user_setting?feature=<f>&value=false)
  const MEMORY_DISABLE_FEATURES = ['hive_referenced_in_internal_knowledge', 'sunshine'];

  function content(node) { return node && node.message && node.message.content; }
  function role(node) { return node && node.message && node.message.author && node.message.author.role; }

  function messageText(node) {
    const c = content(node);
    if (!c) return '';
    if (Array.isArray(c.parts)) {
      return c.parts
        .map((p) => (typeof p === 'string' ? p : p && typeof p.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    if (typeof c.text === 'string') return c.text.trim();
    return '';
  }

  /**
   * Is this node the user-facing final answer? In ChatGPT's payload that means
   * an assistant text message addressed to "all" on the "final" channel. Tool
   * calls use content_type "code" / plugin recipients; reasoning uses
   * "thoughts"/"reasoning_recap" — all excluded here.
   */
  function isFinalAnswer(node) {
    const m = node && node.message;
    if (!m) return false;
    if (role(node) !== 'assistant') return false;
    if (m.recipient && m.recipient !== 'all') return false;
    const ct = m.content && m.content.content_type;
    if (ct !== 'text') return false;
    if (m.channel && m.channel !== 'final') return false;
    return true;
  }

  /** Walk the active branch up from current_node and return the latest final answer text. */
  function extractFinalAnswer(data) {
    if (!data || !data.mapping || !data.current_node) return '';
    const mapping = data.mapping;
    const seen = new Set();
    let id = data.current_node;
    while (id && mapping[id] && !seen.has(id)) {
      seen.add(id);
      const node = mapping[id];
      if (isFinalAnswer(node)) {
        const t = messageText(node);
        if (t) return t;
      }
      id = node.parent;
    }
    return '';
  }

  /** True when the agent declared the goal reached (marker on its own line). */
  function detectGoalMarker(text, marker = GOAL_MARKER) {
    if (!text) return false;
    const m = marker.trim().toLowerCase();
    return text.split(/\r?\n/).some((line) => line.trim().toLowerCase() === m) ||
      text.trim().toLowerCase() === m;
  }

  /**
   * Build the evaluator prompt.
   *
   * The agent acts as a strict acceptor AND a mentor: every turn it picks one of
   * three modes — (1) DONE → emit the exact marker; (2) DIRECT → say what's
   * missing and the concrete next step; (3) never invent requirements beyond the
   * goal. Worded to prevent endless "could also improve" edits.
   *
   * To save tokens we don't repeat the whole instruction+goal each round: the
   * agent chat is persistent, so after the first (full) prompt we send a
   * `full:false` compact prompt that carries only the new executor answer and
   * relies on the earlier instruction/goal still in conversation history. The
   * controller re-injects a full prompt periodically (see goal-loop).
   */
  function buildEvaluatorPrompt(goal, executorAnswer, marker = GOAL_MARKER, opts = {}) {
    const full = opts.full !== false;
    const answer = String(executorAnswer || '').trim();
    if (!full) {
      return [
        'Новый ответ исполнителя — оцени по той же ЦЕЛИ и правилам, что и выше:',
        '',
        answer,
        '',
        `Если цель полностью достигнута — ответь РОВНО одной строкой: ${marker}`,
        'Иначе кратко: чего не хватает и что конкретно сделать дальше (прямое указание/совет), без воды.',
      ].join('\n');
    }
    return [
      'Ты — строгий приёмщик результата и наставник исполнителя. На каждом ходу выбери ОДИН режим ответа:',
      `1) ГОТОВО — если цель полностью достигнута, ответь РОВНО одной строкой, без кавычек и любого другого текста: ${marker}`,
      '2) УКАЗАНИЕ — если цель ещё не достигнута, кратко скажи, чего конкретно не хватает и что сделать дальше (можно дать прямое указание/совет, как продвинуться к цели).',
      'Правила: не предлагай улучшений сверх цели, не изобретай новых требований, не переписывай уже готовое, не добавляй «было бы неплохо». Оценивай строго по факту.',
      '',
      'ЦЕЛЬ:',
      String(goal || '').trim(),
      '',
      'ФИНАЛЬНЫЙ ОТВЕТ ИСПОЛНИТЕЛЯ:',
      answer,
      '',
      `Помни: при достижении цели — только строка ${marker}. Иначе — только реально блокирующие пункты и следующий шаг.`,
    ].join('\n');
  }

  return {
    GOAL_MARKER,
    MEMORY_DISABLE_FEATURES,
    messageText,
    isFinalAnswer,
    extractFinalAnswer,
    detectGoalMarker,
    buildEvaluatorPrompt,
  };
});
