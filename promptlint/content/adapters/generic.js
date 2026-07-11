/**
 * PromptLint adapter — generic fallback
 *
 * Used when a site's dedicated adapter returns null (site shipped a
 * redesign). Heuristic per spec: "largest visible contenteditable/textarea
 * inside a form-like container near a send button."
 *
 * Scoring, per candidate:
 *   + area (log-scaled)              — chat composers are the big input
 *   + inside <form>/[role=form]      — form-like container
 *   + a send-ish button nearby       — button[type=submit] or aria-label/text
 *                                      matching send/submit/ask, within the
 *                                      same container or ≤ 300px away
 *   + bottom half of the viewport    — chat composers sit at the bottom
 *
 * If nothing scores above the floor, return null → extension stays silent.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  PL.adapters = PL.adapters || {};

  const SEND_RE = /send|submit|ask|go\b|→|↑/i;

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 80 && r.height > 14 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function looksLikeSendButton(btn) {
    if (btn.type === 'submit') return true;
    const label = (btn.getAttribute('aria-label') || '') + ' ' + (btn.textContent || '');
    return SEND_RE.test(label.trim().slice(0, 60));
  }

  function nearSendButton(el) {
    try {
      const container = el.closest('form,[role="form"]') || el.parentElement && el.parentElement.parentElement;
      if (container) {
        for (const btn of container.querySelectorAll('button,[role="button"],input[type="submit"]')) {
          if (looksLikeSendButton(btn)) return true;
        }
      }
      const r = el.getBoundingClientRect();
      for (const btn of document.querySelectorAll('button,[role="button"]')) {
        if (!looksLikeSendButton(btn)) continue;
        const b = btn.getBoundingClientRect();
        if (b.width === 0) continue;
        const dx = Math.max(0, Math.max(r.left - b.right, b.left - r.right));
        const dy = Math.max(0, Math.max(r.top - b.bottom, b.top - r.bottom));
        if (dx < 300 && dy < 300) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  PL.adapters.generic = {
    hostSuffixes: [],
    findComposer() {
      try {
        const candidates = [
          ...document.querySelectorAll('div[contenteditable="true"],textarea'),
        ].filter(visible);
        let best = null;
        let bestScore = 0;
        for (const el of candidates) {
          const r = el.getBoundingClientRect();
          let score = Math.log2(Math.max(2, r.width * r.height)); // area, log-scaled
          if (el.closest('form,[role="form"]')) score += 8;
          if (nearSendButton(el)) score += 10;
          if (r.top > window.innerHeight / 2) score += 4; // bottom half of viewport
          if (score > bestScore) {
            bestScore = score;
            best = el;
          }
        }
        // Floor: must at least look form-adjacent, not a random editable div.
        if (!best || bestScore < 18) return null;
        return { el: best, type: best.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable' };
      } catch (e) {
        console.debug('PromptLint: generic adapter failed', e);
        return null;
      }
    },
  };
})();
