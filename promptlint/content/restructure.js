/**
 * PromptLint — content/restructure.js
 *
 * Deterministic, rule-based prompt rewrite. NO LLM, no paraphrasing:
 * it only reorganizes the user's OWN words into a skeleton —
 *
 *   Role/Context: …
 *   Task: …            (numbered 1..N when there are multiple asks)
 *   Details: …
 *   Output format: …
 *
 * — inserting [ADD: …] placeholders for slots the prompt never filled.
 * Classification priority per clause (DECISIONS #18):
 *   format signals → Output format
 *   role/context markers (non-imperative) → Role/Context
 *   imperative start → Task
 *   everything else → Details
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.restructure) return;
  const T = PL.tokenizer;
  const lex = PL.rules.lex;

  // Clause-level role/context cues. A clause matching one of these (and not
  // reading as an imperative ask) belongs in Role/Context.
  const ROLE_CTX_RE =
    /\b(?:as\s+an?\s+\w+|act\s+as\b|you\s+are\s+an?\b|you're\s+an?\b|i\s+am\b|i'm\b|we\s+are\b|we're\b|my\s+\w+|our\s+\w+|for\s+my\b|for\s+our\b|based\s+on\b|given\b|background\b|context\s*:)/i;

  // Clause-level format cues: format lexicon, count+unit, or "in X format/tone".
  function isFormatClause(text) {
    const fmt = new RegExp(lex.FORMAT_RE.source, 'i');
    return fmt.test(text) || lex.COUNT_UNIT_RE.test(text) || /\bin\s+(?:a|an|the)?\s*\w+\s+(?:format|tone|style)\b/i.test(text);
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /** Trim trailing punctuation a fragment dragged along. */
  function tidy(fragment) {
    return fragment.replace(/^[,;:.\s]+|[,;\s]+$/g, '').trim();
  }

  /**
   * @param {object} analysis  from PromptLint.tokenizer.analyze
   * @returns {{text: string, slots: object}}
   */
  function restructure(analysis) {
    const slots = { roleContext: [], tasks: [], details: [], format: [] };

    for (const clause of analysis.clauses) {
      let frag = tidy(lex.stripFiller(clause.text));
      if (!frag) continue;
      const imperative = lex.isImperativeClause(analysis, clause);

      if (isFormatClause(frag) && !imperative) {
        slots.format.push(frag);
      } else if (isFormatClause(frag) && imperative && /\b(?:format|table|json|markdown|bullets?|bullet points?)\b/i.test(frag) && !/\b(?:write|create|generate|draft|build|compose|produce)\b/i.test(frag)) {
        // e.g. "format it as a table", "use JSON" — an ask that IS a format spec
        slots.format.push(frag);
      } else if (ROLE_CTX_RE.test(frag) && !imperative) {
        slots.roleContext.push(frag);
      } else if (imperative) {
        slots.tasks.push(frag);
      } else {
        slots.details.push(frag);
      }
    }

    // Pull an inline format tail out of a task if it's the only format info,
    // e.g. "write a summary in 100 words" or "explain it as a table".
    // Only explicit forms qualify (count+unit, or as/in + container format) —
    // a bare lexicon word like "tone" in "fix the tone" is the task's object,
    // not a format spec.
    if (slots.format.length === 0) {
      const CONTAINER_RE =
        /\b(?:as|in|into)\s+(?:a\s+|an\s+|the\s+)?(?:table|json|csv|xml|yaml|markdown|bullet points?|bullets|numbered list|outline|checklist|code block)\b/i;
      for (const t of slots.tasks) {
        const m = t.match(lex.COUNT_UNIT_RE) || t.match(CONTAINER_RE);
        if (m) { slots.format.push(m[0]); break; }
      }
    }

    const lines = [];

    lines.push(
      'Role/Context: ' +
        (slots.roleContext.length
          ? capitalize(slots.roleContext.map(tidy).join('; '))
          : '[ADD: who you are, who this is for, or the relevant background]')
    );

    if (slots.tasks.length === 0) {
      lines.push('Task: [ADD: the specific thing you want done]');
    } else if (slots.tasks.length === 1) {
      lines.push('Task: ' + capitalize(tidy(slots.tasks[0])));
    } else {
      lines.push('Task:');
      slots.tasks.forEach((t, i) => lines.push(`  ${i + 1}. ${capitalize(tidy(t))}`));
    }

    lines.push(
      'Details: ' +
        (slots.details.length
          ? capitalize(slots.details.map(tidy).join('; '))
          : '[ADD: key details, constraints, or examples]')
    );

    lines.push(
      'Output format: ' +
        (slots.format.length
          ? capitalize(slots.format.map(tidy).join('; '))
          : '[ADD: desired format — e.g. "5 bullet points, under 150 words"]')
    );

    return { text: lines.join('\n'), slots };
  }

  PL.restructure = restructure;
})();
