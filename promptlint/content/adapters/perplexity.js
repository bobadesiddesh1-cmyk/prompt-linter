/**
 * PromptLint adapter — perplexity.ai
 *
 * ADAPTER-REPAIR NOTES:
 *  Perplexity has shipped BOTH composer kinds: historically a <textarea>
 *  (placeholder "Ask anything…"), currently a contenteditable div with
 *  id "ask-input" on most builds. Handle both — this adapter is also the
 *  one that exercises the textarea mirror-overlay path (DECISIONS #17).
 *
 *  Strategy 1: '#ask-input' — current contenteditable (Lexical editor).
 *  Strategy 2: 'textarea[placeholder]' whose placeholder starts with "Ask"
 *              — the classic search box.
 *  Strategy 3: 'main textarea' / any visible contenteditable[role="textbox"]
 *              — last-resort within the app shell.
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

  function typeOf(el) {
    return el.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable';
  }

  PL.adapters['perplexity.ai'] = {
    hostSuffixes: ['perplexity.ai'],
    findComposer() {
      try {
        // Strategy 1: current contenteditable ask box.
        let el = document.getElementById('ask-input');
        if (el && visible(el)) return { el, type: typeOf(el) };
        // Strategy 2: classic "Ask anything" textarea.
        for (const ta of document.querySelectorAll('textarea[placeholder]')) {
          if (/^ask/i.test(ta.getAttribute('placeholder') || '') && visible(ta)) {
            return { el: ta, type: 'textarea' };
          }
        }
        // Strategy 3: app-shell fallbacks.
        el = document.querySelector('main textarea');
        if (el && visible(el)) return { el, type: 'textarea' };
        el = document.querySelector('div[contenteditable="true"][role="textbox"]');
        if (el && visible(el)) return { el, type: 'contenteditable' };
        return null;
      } catch (e) {
        console.debug('PromptLint: perplexity adapter failed', e);
        return null;
      }
    },
  };
})();
