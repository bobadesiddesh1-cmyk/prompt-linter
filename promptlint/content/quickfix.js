/**
 * PromptLint — content/quickfix.js
 *
 * One-click patches for issues that can be fixed mechanically without
 * guessing what the user meant. Every fix is a pure string transform:
 *   getQuickFix(issue, analysis) → {label, hint, apply(text) → newText} | null
 *
 * Design rule: a quick fix either (a) deletes something that is pure waste,
 * or (b) appends a clearly-marked scaffold line the user finishes. It never
 * silently invents content or rewrites the user's own words — that would put
 * words in their mouth. Scaffolds use the same [ADD: …] marker as the
 * restructure engine so the two features read as one idea.
 *
 * Issues with no honest mechanical fix (vague ask, dangling reference,
 * contradiction) return null: the panel shows the advice, the user decides.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.quickfix) return;

  /** Append a line, keeping exactly one blank line before it. */
  function appendLine(text, line) {
    const base = text.replace(/\s+$/, '');
    return base + '\n\n' + line;
  }

  const FIXES = {
    // Delete politeness padding — pure waste, safe to remove outright.
    filler(issue, analysis) {
      return {
        label: 'Remove filler',
        hint: 'Deletes the padding phrase',
        apply(text) {
          const before = text.slice(0, issue.start);
          const after = text.slice(issue.end);
          // Collapse the seam so we never leave a double space or a
          // stranded capital-less sentence start.
          let out = (before + after).replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1');
          out = out.replace(/^\s+/, '');
          if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
          return out;
        },
      };
    },

    'no-output-format'() {
      return {
        label: 'Add format line',
        hint: 'Appends an output-format scaffold',
        apply: (text) => appendLine(text, 'Output format: [ADD: e.g. 5 bullet points, under 150 words, confident tone]'),
      };
    },

    'no-context'() {
      return {
        label: 'Add context line',
        hint: 'Appends a context scaffold',
        apply: (text) => appendLine(text, 'Context: [ADD: who this is for, what it relates to, any background]'),
      };
    },

    'missing-audience'() {
      return {
        label: 'Add audience',
        hint: 'Appends an audience/role scaffold',
        apply: (text) => appendLine(text, 'Audience: [ADD: who will read this] · Write as: [ADD: role, e.g. a copywriter]'),
      };
    },

    'no-success-criteria'() {
      return {
        label: 'Add criteria',
        hint: 'Appends a quantity/ranking scaffold',
        apply: (text) => appendLine(text, 'Give the top [ADD: number] options, ranked by [ADD: what matters most].'),
      };
    },

    // Multi-ask has a real mechanical fix, but it is the restructure engine's
    // job (it numbers the asks). The panel routes this one there.
    'multi-ask'() {
      return {
        label: 'Number the asks',
        hint: 'Runs Restructure, which numbers each ask',
        restructure: true,
        apply: (text) => text,
      };
    },
  };

  /**
   * @param {object} issue    from PromptLint.rules.run
   * @param {object} analysis from PromptLint.tokenizer.analyze
   * @returns {{label:string,hint:string,apply:Function,restructure?:boolean}|null}
   */
  function getQuickFix(issue, analysis) {
    try {
      const make = FIXES[issue.id];
      if (!make) return null;
      return make(issue, analysis) || null;
    } catch (e) {
      console.debug('PromptLint: quickfix build failed', issue && issue.id, e);
      return null;
    }
  }

  PL.quickfix = { getQuickFix };
})();
