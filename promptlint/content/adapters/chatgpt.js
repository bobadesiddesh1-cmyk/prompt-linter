/**
 * PromptLint adapter — chatgpt.com
 *
 * ADAPTER-REPAIR NOTES (update selectors here when ChatGPT ships a redesign):
 *  Strategy 1: '#prompt-textarea' — ChatGPT's composer has carried this id for
 *              years, first as a <textarea>, now as a contenteditable
 *              ProseMirror <div>. Most stable hook on the page.
 *  Strategy 2: 'div.ProseMirror[contenteditable="true"]' — the ProseMirror
 *              editor class if the id is ever dropped.
 *  Strategy 3: 'form textarea' — pre-2024 markup / A-B fallbacks where the
 *              composer is still a plain textarea inside the send form.
 *
 * Return null when nothing matches — main.js will then try generic.js, and
 * if that also fails the extension stays silent on the page.
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

  PL.adapters['chatgpt.com'] = {
    hostSuffixes: ['chatgpt.com'],
    findComposer() {
      try {
        // Strategy 1: stable id (currently a ProseMirror contenteditable div).
        let el = document.getElementById('prompt-textarea');
        if (el && visible(el)) {
          return { el, type: el.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable' };
        }
        // Strategy 2: ProseMirror editor class.
        el = document.querySelector('div.ProseMirror[contenteditable="true"]');
        if (el && visible(el)) return { el, type: 'contenteditable' };
        // Strategy 3: legacy textarea inside the composer form.
        el = document.querySelector('form textarea');
        if (el && visible(el)) return { el, type: 'textarea' };
        return null;
      } catch (e) {
        console.debug('PromptLint: chatgpt adapter failed', e);
        return null;
      }
    },
  };
})();
