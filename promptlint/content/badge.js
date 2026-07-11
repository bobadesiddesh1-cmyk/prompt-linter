/**
 * PromptLint — content/badge.js
 *
 * Floating score badge pinned to the composer's bottom-right corner.
 * Shadow DOM, fixed positioning, repositions on composer resize
 * (ResizeObserver), window scroll and window resize (rAF-throttled).
 * Click → toggles the panel (callback wired by main.js).
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.Badge) return;
  const UI = PL.ui;

  class Badge {
    /**
     * @param {Element} composerEl
     * @param {Function} onClick
     * @param {Function} onReposition  called with the badge's rect after every move
     */
    constructor(composerEl, onClick, onReposition) {
      this.composer = composerEl;
      this.onReposition = onReposition || (() => {});
      this._raf = 0;
      this._destroyed = false;

      const { host, shadow } = UI.makeShadowHost('promptlint-badge-host', UI.Z_BADGE);
      this.host = host;
      const style = document.createElement('style');
      style.textContent = UI.BASE_CSS + `
        .badge {
          position: fixed;
          min-width: 34px;
          height: 24px;
          padding: 0 8px;
          border-radius: 12px;
          border: none;
          display: none;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #fff;
          background: ${UI.COLORS.neutral};
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 2px 8px rgba(0,0,0,.25);
          user-select: none;
          transition: background .2s ease, transform .1s ease;
        }
        .badge:hover { transform: scale(1.08); }
        .badge .dot { font-weight: 400; opacity: .9; font-size: 10px; }
      `;
      shadow.appendChild(style);

      this.btn = UI.el('button', {
        class: 'pl-root badge',
        title: 'PromptLint — click for details',
        'aria-label': 'PromptLint prompt strength score',
        onclick: (e) => {
          try {
            e.stopPropagation(); // keep host page from reacting to OUR button (never the reverse)
            onClick && onClick();
          } catch (err) {
            console.debug('PromptLint: badge click failed', err);
          }
        },
      });
      shadow.appendChild(this.btn);

      this._reposition = () => this._schedule();
      try {
        this._ro = new ResizeObserver(() => this._schedule());
        this._ro.observe(composerEl);
        window.addEventListener('scroll', this._reposition, { passive: true, capture: true });
        window.addEventListener('resize', this._reposition, { passive: true });
      } catch (e) {
        console.debug('PromptLint: badge observers failed', e);
      }
      this._schedule();
    }

    _schedule() {
      if (this._raf || this._destroyed) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.position();
      });
    }

    position() {
      if (this._destroyed) return;
      try {
        const rect = this.composer.getBoundingClientRect();
        const visible = rect.width > 40 && rect.height > 10 && rect.bottom > 0 && rect.top < window.innerHeight;
        if (!visible) {
          this.btn.style.display = 'none';
          return;
        }
        this.btn.style.display = 'flex';
        const bw = this.btn.offsetWidth || 40;
        let left = rect.right - bw - 10;
        let top = rect.bottom - 34;
        left = Math.min(Math.max(8, left), window.innerWidth - bw - 8);
        top = Math.min(Math.max(8, top), window.innerHeight - 32);
        this.btn.style.left = left + 'px';
        this.btn.style.top = top + 'px';
        this.onReposition(this.btn.getBoundingClientRect());
      } catch (e) {
        console.debug('PromptLint: badge position failed', e);
      }
    }

    /**
     * @param {number} score 0–100
     * @param {number} issueCount
     * @param {boolean} hasText  false → neutral "–" state
     */
    update(score, issueCount, hasText) {
      try {
        this.btn.style.background = UI.gradeColor(score, hasText);
        this.btn.textContent = '';
        this.btn.appendChild(document.createTextNode(hasText ? String(score) : '–'));
        if (hasText && issueCount > 0) {
          this.btn.appendChild(UI.el('span', { class: 'dot', text: '• ' + issueCount }));
        }
        this._schedule(); // width may have changed
      } catch (e) {
        console.debug('PromptLint: badge update failed', e);
      }
    }

    destroy() {
      this._destroyed = true;
      try {
        if (this._ro) this._ro.disconnect();
        window.removeEventListener('scroll', this._reposition, { capture: true });
        window.removeEventListener('resize', this._reposition);
        cancelAnimationFrame(this._raf);
        this.host.remove();
      } catch (e) { /* no-op */ }
    }
  }

  PL.Badge = Badge;
})();
