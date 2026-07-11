/**
 * PromptLint adapter — gemini.google.com
 *
 * ADAPTER-REPAIR NOTES:
 *  Strategy 1: 'rich-textarea .ql-editor' — Gemini's composer is a Quill
 *              editor (contenteditable div with class ql-editor) inside the
 *              custom <rich-textarea> element. Both hooks have survived every
 *              redesign since Bard.
 *  Strategy 2: 'div.ql-editor[contenteditable="true"]' — Quill editor class
 *              alone if <rich-textarea> is renamed.
 *  Strategy 3: 'div[contenteditable="true"][aria-label]' whose label mentions
 *              prompt/enter — Gemini sets aria-label like "Enter a prompt here".
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  PL.adapters = PL.adapters || {};

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 50 && r.height > 10;
  }

  PL.adapters['gemini.google.com'] = {
    hostSuffixes: ['gemini.google.com'],
    findComposer() {
      try {
        // Strategy 1: Quill editor inside <rich-textarea>.
        let el = document.querySelector('rich-textarea .ql-editor');
        if (el && visible(el)) return { el, type: 'contenteditable' };
        // Strategy 2: bare Quill editor.
        el = document.querySelector('div.ql-editor[contenteditable="true"]');
        if (el && visible(el)) return { el, type: 'contenteditable' };
        // Strategy 3: aria-labelled prompt box.
        for (const cand of document.querySelectorAll('div[contenteditable="true"][aria-label]')) {
          const label = (cand.getAttribute('aria-label') || '').toLowerCase();
          if ((label.includes('prompt') || label.includes('enter')) && visible(cand)) {
            return { el: cand, type: 'contenteditable' };
          }
        }
        return null;
      } catch (e) {
        console.debug('PromptLint: gemini adapter failed', e);
        return null;
      }
    },
  };
})();
