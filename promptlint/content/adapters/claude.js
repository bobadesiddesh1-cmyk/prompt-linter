/**
 * PromptLint adapter — claude.ai
 *
 * ADAPTER-REPAIR NOTES:
 *  Strategy 1: 'div[contenteditable="true"].ProseMirror' — Claude's composer
 *              is a ProseMirror contenteditable inside the chat input
 *              fieldset; the ProseMirror class has been stable since launch.
 *  Strategy 2: 'div[contenteditable="true"][aria-label]' whose aria-label
 *              mentions the prompt/message — Claude labels the editor for
 *              accessibility ("Write your prompt to Claude" and variants).
 *  Strategy 3: 'fieldset div[contenteditable="true"]' — the composer lives
 *              inside a <fieldset> wrapper on current builds; any
 *              contenteditable inside one is almost certainly the composer.
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

  PL.adapters['claude.ai'] = {
    hostSuffixes: ['claude.ai'],
    findComposer() {
      try {
        // Strategy 1: ProseMirror contenteditable.
        let el = document.querySelector('div[contenteditable="true"].ProseMirror');
        if (el && visible(el)) return { el, type: 'contenteditable' };
        // Strategy 2: aria-labelled prompt editor.
        for (const cand of document.querySelectorAll('div[contenteditable="true"][aria-label]')) {
          const label = (cand.getAttribute('aria-label') || '').toLowerCase();
          if ((label.includes('prompt') || label.includes('message') || label.includes('claude')) && visible(cand)) {
            return { el: cand, type: 'contenteditable' };
          }
        }
        // Strategy 3: contenteditable inside the composer fieldset.
        el = document.querySelector('fieldset div[contenteditable="true"]');
        if (el && visible(el)) return { el, type: 'contenteditable' };
        return null;
      } catch (e) {
        console.debug('PromptLint: claude adapter failed', e);
        return null;
      }
    },
  };
})();
