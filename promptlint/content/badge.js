/**
 * PromptLint — content/badge.js
 *
 * Floating score badge pinned to the composer's bottom-right corner.
 * Shadow DOM, fixed positioning, repositions on composer resize
 * (ResizeObserver), window scroll and window resize (rAF-throttled).
 * Click → toggles the panel (callback wired by main.js).
 *
 * Look & feel: a branded pill — purple "P" logo mark + score — on a
 * host-neutral (light/dark) background, so it reads as a deliberate tool
 * rather than blending into the site's own buttons. On mount it plays a
 * soft two-beat glow pulse to catch the eye once, and main.js can show a
 * one-time onboarding callout explaining what the badge is.
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
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 2px 10px rgba(0,0,0,.18);
          user-select: none;
          transition: transform .12s ease, box-shadow .2s ease;
        }
        .badge:hover { transform: scale(1.06); box-shadow: 0 4px 14px rgba(0,0,0,.28); }
        .badge[data-state="empty"] { padding: 0 8px 0 5px; }
        .logo {
          width: 17px; height: 17px; border-radius: 5px; flex: none;
          background: ${UI.COLORS.accent}; color: #fff;
          font: 800 11px/17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          text-align: center; display: inline-block;
        }
        .wordmark { font-weight: 700; font-size: 11px; color: var(--pl-fg2); letter-spacing: .01em; }
        .score { font-weight: 800; font-size: 13px; }
        .count { font-weight: 600; font-size: 10.5px; color: var(--pl-fg2); }
        @keyframes pl-pulse {
          0%   { box-shadow: 0 2px 10px rgba(0,0,0,.18), 0 0 0 0 rgba(124,58,237,.45); }
          70%  { box-shadow: 0 2px 10px rgba(0,0,0,.18), 0 0 0 9px rgba(124,58,237,0); }
          100% { box-shadow: 0 2px 10px rgba(0,0,0,.18), 0 0 0 0 rgba(124,58,237,0); }
        }
        .badge.pulse { animation: pl-pulse 1.5s ease-out 2; }
        .callout {
          position: fixed;
          max-width: 270px;
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
        .callout .gotit {
          display: block; margin-top: 8px; padding: 5px 12px;
          border: none; border-radius: 7px; cursor: pointer;
          background: var(--pl-accent); color: #fff; font-weight: 700; font-size: 12px;
        }
      `;
      shadow.appendChild(style);

      this.btn = UI.el('button', {
        class: 'pl-root badge pulse',
        title: 'PromptLint — click for prompt feedback',
        'aria-label': 'PromptLint prompt strength score — click for details',
        onclick: (e) => {
          try {
            e.stopPropagation(); // keep host page from reacting to OUR button (never the reverse)
            this.hideCallout();
            onClick && onClick();
          } catch (err) {
            console.debug('PromptLint: badge click failed', err);
          }
        },
      });
      shadow.appendChild(this.btn);

      // One-time onboarding callout (shown by main.js on first ever run).
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
        let left = rect.right - bw - 10;
        let top = rect.bottom - 36;
        left = Math.min(Math.max(8, left), window.innerWidth - bw - 8);
        top = Math.min(Math.max(8, top), window.innerHeight - 34);
        this.btn.style.left = left + 'px';
        this.btn.style.top = top + 'px';
        const btnRect = this.btn.getBoundingClientRect();
        if (this.callout.style.display === 'block') {
          const cr = this.callout.getBoundingClientRect();
          let cLeft = Math.min(Math.max(8, btnRect.right - cr.width), window.innerWidth - cr.width - 8);
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

    /**
     * @param {number} score 0–100
     * @param {number} issueCount
     * @param {boolean} hasText  false → branded idle state (logo + wordmark)
     */
    update(score, issueCount, hasText) {
      try {
        this.btn.textContent = '';
        this.btn.dataset.state = hasText ? 'scored' : 'empty';
        this.btn.appendChild(UI.el('span', { class: 'logo', text: 'P' }));
        if (hasText) {
          this.btn.appendChild(
            UI.el('span', { class: 'score', text: String(score), style: 'color:' + UI.gradeColor(score, true) })
          );
          if (issueCount > 0) {
            this.btn.appendChild(UI.el('span', { class: 'count', text: '· ' + issueCount }));
          }
          this.btn.title = `PromptLint — prompt strength ${score}/100, ` +
            (issueCount ? `${issueCount} issue${issueCount === 1 ? '' : 's'}. Click for details & restructure.`
                        : 'no issues. Click for details.');
        } else {
          this.btn.appendChild(UI.el('span', { class: 'wordmark', text: 'PromptLint' }));
          this.btn.title = 'PromptLint — start typing and I\'ll score your prompt. Click to learn more.';
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
          'checks your prompt as you type — vague asks, missing format, and more. ' +
          'Click the score for the issue list and a one-click restructure.'
        ));
        const gotit = UI.el('button', {
          class: 'gotit',
          text: 'Got it',
          onclick: () => {
            this.hideCallout();
            onDismiss && onDismiss();
          },
        });
        this.callout.appendChild(p);
        this.callout.appendChild(gotit);
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
        this.host.remove();
      } catch (e) { /* no-op */ }
    }
  }

  PL.Badge = Badge;
})();
