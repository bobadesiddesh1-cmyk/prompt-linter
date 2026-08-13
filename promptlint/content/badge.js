/**
 * PromptLint — content/badge.js
 *
 * Floating score badge. Branded pill (sparkle mark + grade-coloured score)
 * anchored to the composer's bottom-right corner by default.
 *
 * v1.1.0 — the badge is now DRAGGABLE. Users complained it covered the
 * composer's own controls, so:
 *   · pointer-drag moves it anywhere on screen; the offset from the
 *     composer corner is persisted per site (so it survives resizes,
 *     SPA navigation and reloads)
 *   · a <5px pointer movement still counts as a click (opens the panel)
 *   · it auto-dims to 40% while you're actively typing and returns to full
 *     opacity on hover, so it never fights the text underneath
 *   · "Reset position" in the panel puts it back in the corner
 *
 * Never attaches a keydown/keypress/keyup listener — Enter/send is untouched.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.Badge) return;
  const UI = PL.ui;

  const DRAG_THRESHOLD = 5; // px before a press becomes a drag, not a click
  const DIM_AFTER_MS = 1200;

  class Badge {
    /**
     * @param {Element} composerEl
     * @param {Function} onClick
     * @param {Function} onReposition  called with the badge rect after every move
     * @param {Function} onMoved       called with {dx,dy} when a drag finishes
     * @param {{dx:number,dy:number}} initialOffset  saved offset from the corner
     */
    constructor(composerEl, onClick, onReposition, onMoved, initialOffset) {
      this.composer = composerEl;
      this.onReposition = onReposition || (() => {});
      this.onMoved = onMoved || (() => {});
      this.dx = (initialOffset && initialOffset.dx) || 0;
      this.dy = (initialOffset && initialOffset.dy) || 0;
      this._raf = 0;
      this._destroyed = false;
      this._drag = null;
      this._dimTimer = 0;
      this._calloutTimer = 0;

      const { host, shadow } = UI.makeShadowHost('promptlint-badge-host', UI.Z_BADGE);
      this.host = host;
      const style = document.createElement('style');
      style.textContent = UI.BASE_CSS + `
        .badge {
          position: fixed;
          height: 26px;
          padding: 0 10px 0 5px;
          border-radius: 13px;
          border: 1px solid var(--pl-border);
          display: none;
          align-items: center;
          gap: 6px;
          font: 700 12.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: var(--pl-fg);
          background: var(--pl-bg);
          cursor: grab;
          pointer-events: auto;
          box-shadow: 0 2px 10px rgba(0,0,0,.18);
          user-select: none;
          touch-action: none;
          transition: transform .12s ease, box-shadow .2s ease, opacity .25s ease;
        }
        .badge:hover { transform: scale(1.06); opacity: 1 !important; }
        .badge.dim { opacity: .4; }
        .badge.dragging { cursor: grabbing; transform: scale(1.1); box-shadow: 0 8px 22px rgba(0,0,0,.4); transition: none; }
        .badge[data-state="empty"] { padding: 0 8px 0 5px; }
        .logo {
          width: 17px; height: 17px; border-radius: 5px; flex: none;
          background: ${UI.COLORS.gradient}; color: #fff;
          font: 800 11px/17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          text-align: center; display: inline-block;
        }
        .wordmark { font-weight: 700; font-size: 11px; color: var(--pl-fg2); letter-spacing: .01em; }
        .score { font-weight: 800; font-size: 13px; }
        .count { font-weight: 600; font-size: 10.5px; color: var(--pl-fg2); }
        @keyframes pl-pulse {
          0%   { box-shadow: 0 2px 10px rgba(0,0,0,.18), 0 0 0 0 rgba(139,92,246,.5); }
          70%  { box-shadow: 0 2px 10px rgba(0,0,0,.18), 0 0 0 9px rgba(139,92,246,0); }
          100% { box-shadow: 0 2px 10px rgba(0,0,0,.18), 0 0 0 0 rgba(139,92,246,0); }
        }
        .badge.pulse { animation: pl-pulse 1.5s ease-out 2; }
        .callout {
          position: fixed;
          max-width: 272px;
          background: var(--pl-bg);
          color: var(--pl-fg);
          border: 1px solid var(--pl-border);
          border-radius: 12px;
          box-shadow: var(--pl-shadow);
          padding: 11px 13px;
          font-size: 12.5px;
          line-height: 1.5;
          pointer-events: auto;
          display: none;
        }
        .callout b { color: var(--pl-accent); }
        .callout .tip { color: var(--pl-fg2); font-size: 11.5px; margin-top: 6px; }
        .callout .gotit {
          display: block; margin-top: 9px; padding: 5px 12px;
          border: none; border-radius: 7px; cursor: pointer;
          background: var(--pl-grad); color: #fff; font-weight: 700; font-size: 12px;
        }
      `;
      shadow.appendChild(style);

      this.btn = UI.el('button', {
        class: 'pl-root badge pulse',
        'aria-label': 'PromptLint prompt strength score — click for details, drag to move',
      });

      // --- drag / click handling (pointer events, our element only) ---
      this.btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        this._drag = { sx: e.clientX, sy: e.clientY, ox: this.dx, oy: this.dy, moved: false };
        try { this.btn.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
      });
      this.btn.addEventListener('pointermove', (e) => {
        if (!this._drag) return;
        const mx = e.clientX - this._drag.sx;
        const my = e.clientY - this._drag.sy;
        if (!this._drag.moved && Math.sqrt(mx * mx + my * my) < DRAG_THRESHOLD) return;
        this._drag.moved = true;
        this.btn.classList.add('dragging');
        this.btn.classList.remove('dim', 'pulse');
        this.dx = this._drag.ox + mx;
        this.dy = this._drag.oy + my;
        this.position();
      });
      const endDrag = (e) => {
        const d = this._drag;
        if (!d) return;
        this._drag = null;
        this.btn.classList.remove('dragging');
        try { this.btn.releasePointerCapture(e.pointerId); } catch (err) { /* no-op */ }
        if (d.moved) {
          this.hideCallout();
          this.onMoved({ dx: Math.round(this.dx), dy: Math.round(this.dy) });
        } else {
          this.hideCallout();
          try { onClick && onClick(); } catch (err) { console.debug('PromptLint: badge click failed', err); }
        }
      };
      this.btn.addEventListener('pointerup', endDrag);
      this.btn.addEventListener('pointercancel', endDrag);
      // Keyboard activation only (detail === 0); mouse clicks are handled above.
      this.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.detail === 0) { this.hideCallout(); onClick && onClick(); }
      });
      this.btn.addEventListener('mouseenter', () => this.btn.classList.remove('dim'));
      shadow.appendChild(this.btn);

      this.callout = UI.el('div', { class: 'pl-root callout' });
      shadow.appendChild(this.callout);

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
          this.callout.style.display = 'none';
          return;
        }
        this.btn.style.display = 'flex';
        const bw = this.btn.offsetWidth || 44;
        let left = rect.right - bw - 10 + this.dx;
        let top = rect.bottom - 36 + this.dy;
        left = Math.min(Math.max(8, left), window.innerWidth - bw - 8);
        top = Math.min(Math.max(8, top), window.innerHeight - 32);
        this.btn.style.left = left + 'px';
        this.btn.style.top = top + 'px';
        const btnRect = this.btn.getBoundingClientRect();
        if (this.callout.style.display === 'block') {
          const cr = this.callout.getBoundingClientRect();
          const cLeft = Math.min(Math.max(8, btnRect.right - cr.width), window.innerWidth - cr.width - 8);
          let cTop = btnRect.top - cr.height - 10;
          if (cTop < 8) cTop = btnRect.bottom + 10;
          this.callout.style.left = cLeft + 'px';
          this.callout.style.top = cTop + 'px';
        }
        this.onReposition(btnRect);
      } catch (e) {
        console.debug('PromptLint: badge position failed', e);
      }
    }

    /** Put the badge back in the composer's corner. */
    resetPosition() {
      this.dx = 0;
      this.dy = 0;
      this.onMoved({ dx: 0, dy: 0 });
      this._schedule();
    }

    /** Fade out briefly while the user types so it never blocks the text. */
    nudgeDim() {
      try {
        if (this._drag) return;
        this.btn.classList.add('dim');
        clearTimeout(this._dimTimer);
        this._dimTimer = setTimeout(() => this.btn.classList.remove('dim'), DIM_AFTER_MS);
      } catch (e) { /* no-op */ }
    }

    /**
     * @param {number} score 0–100
     * @param {number} issueCount
     * @param {boolean} hasText  false → branded idle state (logo + wordmark)
     */
    update(score, issueCount, hasText) {
      try {
        this.btn.textContent = '';
        this.btn.dataset.state = hasText ? 'scored' : 'empty';
        this.btn.appendChild(UI.el('span', { class: 'logo', text: '✦' }));
        if (hasText) {
          this.btn.appendChild(
            UI.el('span', { class: 'score', text: String(score), style: 'color:' + UI.gradeColor(score, true) })
          );
          if (issueCount > 0) {
            this.btn.appendChild(UI.el('span', { class: 'count', text: '· ' + issueCount }));
          }
          this.btn.title = `PromptLint — prompt strength ${score}/100, ` +
            (issueCount ? `${issueCount} issue${issueCount === 1 ? '' : 's'}. Click for details · drag to move.`
                        : 'no issues. Click for details · drag to move.');
        } else {
          this.btn.appendChild(UI.el('span', { class: 'wordmark', text: 'PromptLint' }));
          this.btn.title = 'PromptLint — start typing and I\'ll score your prompt. Click for details · drag to move.';
        }
        this._schedule(); // width may have changed
      } catch (e) {
        console.debug('PromptLint: badge update failed', e);
      }
    }

    /** One-time first-run explainer bubble. onDismiss fires once acknowledged. */
    showCallout(onDismiss) {
      try {
        this.callout.textContent = '';
        const p = UI.el('div');
        p.appendChild(UI.el('b', { text: 'PromptLint ' }));
        p.appendChild(document.createTextNode(
          'scores your prompt as you type. Click it for the issue list and a one-click restructure.'
        ));
        this.callout.appendChild(p);
        this.callout.appendChild(UI.el('div', { class: 'tip', text: '💡 In the way? Just drag it anywhere.' }));
        this.callout.appendChild(UI.el('button', {
          class: 'gotit',
          text: 'Got it',
          onclick: () => { this.hideCallout(); onDismiss && onDismiss(); },
        }));
        this.callout.style.display = 'block';
        this._schedule();
        clearTimeout(this._calloutTimer);
        this._calloutTimer = setTimeout(() => {
          this.hideCallout();
          onDismiss && onDismiss();
        }, 15000);
      } catch (e) {
        console.debug('PromptLint: callout failed', e);
      }
    }

    hideCallout() {
      try {
        this.callout.style.display = 'none';
        clearTimeout(this._calloutTimer);
      } catch (e) { /* no-op */ }
    }

    destroy() {
      this._destroyed = true;
      try {
        if (this._ro) this._ro.disconnect();
        window.removeEventListener('scroll', this._reposition, { capture: true });
        window.removeEventListener('resize', this._reposition);
        cancelAnimationFrame(this._raf);
        clearTimeout(this._calloutTimer);
        clearTimeout(this._dimTimer);
        this.host.remove();
      } catch (e) { /* no-op */ }
    }
  }

  PL.Badge = Badge;
})();
