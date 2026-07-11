/**
 * PromptLint — shared/ui-kit.js
 *
 * Tiny DOM helpers + shared design tokens for all Shadow-DOM UI
 * (badge, panel, mini-card, textarea mirror). No frameworks.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.ui) return;

  const COLORS = {
    high: '#EF4444',
    med: '#F97316',
    low: '#EAB308',
    strong: '#22C55E',
    ok: '#F59E0B',
    weak: '#EF4444',
    neutral: '#9CA3AF',
    accent: '#7C3AED',
  };

  const Z_BADGE = 2147483644;
  const Z_PANEL = 2147483645;
  const Z_CARD = 2147483646;

  function severityColor(sev) {
    return COLORS[sev] || COLORS.neutral;
  }

  function gradeColor(score, hasText) {
    if (!hasText) return COLORS.neutral;
    if (score >= 80) return COLORS.strong;
    if (score >= 60) return COLORS.ok;
    return COLORS.weak;
  }

  /** el('div', {class:'x', text:'hi', onclick: fn, dataset:{i:1}}, [children]) */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style') node.style.cssText = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    if (children) for (const c of children) if (c) node.appendChild(c);
    return node;
  }

  /**
   * Create a fixed-position shadow host attached to <html> (not <body>) so
   * host-page CSS resets and body re-renders can't touch it.
   */
  function makeShadowHost(id, zIndex) {
    const host = document.createElement('div');
    host.id = id;
    host.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;z-index:' + zIndex + ';' +
      'margin:0;padding:0;border:0;background:none;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'open' });
    (document.documentElement || document.body).appendChild(host);
    return { host, shadow };
  }

  /**
   * Base CSS shared by every shadow root: box-sizing, font stack and
   * light/dark tokens driven by prefers-color-scheme.
   */
  const BASE_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .pl-root {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: var(--pl-fg);
      --pl-bg: #ffffff;
      --pl-bg2: #f4f4f5;
      --pl-fg: #18181b;
      --pl-fg2: #52525b;
      --pl-border: #e4e4e7;
      --pl-shadow: 0 8px 30px rgba(0,0,0,.18);
      --pl-accent: ${COLORS.accent};
    }
    @media (prefers-color-scheme: dark) {
      .pl-root {
        --pl-bg: #1f1f23;
        --pl-bg2: #2a2a30;
        --pl-fg: #f4f4f5;
        --pl-fg2: #a1a1aa;
        --pl-border: #3f3f46;
        --pl-shadow: 0 8px 30px rgba(0,0,0,.55);
      }
    }
  `;

  /**
   * Hover mini-card: rule message + fix suggestion near the pointer.
   * One instance per page, reused for every issue.
   */
  class MiniCard {
    constructor() {
      this._mounted = false;
    }
    _mount() {
      if (this._mounted) return;
      const { host, shadow } = makeShadowHost('promptlint-minicard-host', Z_CARD);
      this.host = host;
      const style = document.createElement('style');
      style.textContent = BASE_CSS + `
        .card {
          position: fixed;
          max-width: 320px;
          background: var(--pl-bg);
          color: var(--pl-fg);
          border: 1px solid var(--pl-border);
          border-radius: 10px;
          box-shadow: var(--pl-shadow);
          padding: 10px 12px;
          pointer-events: none;
          display: none;
        }
        .sev { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
        .title { font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; }
        .msg { color: var(--pl-fg); margin-bottom: 4px; }
        .fix { color: var(--pl-fg2); font-size: 12px; }
        .fix b { color: var(--pl-fg); }
      `;
      shadow.appendChild(style);
      this.card = el('div', { class: 'pl-root card' });
      shadow.appendChild(this.card);
      this._mounted = true;
    }
    show(issue, x, y) {
      try {
        this._mount();
        this.card.textContent = '';
        const dot = el('span', { class: 'sev', style: 'background:' + severityColor(issue.severity) });
        this.card.appendChild(
          el('div', { class: 'title' }, [dot, el('span', { text: issue.ruleName })])
        );
        this.card.appendChild(el('div', { class: 'msg', text: issue.message }));
        if (issue.fix) {
          const fix = el('div', { class: 'fix' });
          const b = el('b', { text: 'Fix: ' });
          fix.appendChild(b);
          fix.appendChild(document.createTextNode(issue.fix));
          this.card.appendChild(fix);
        }
        this.card.style.display = 'block';
        // Position after display so we can measure; keep on-screen.
        const r = this.card.getBoundingClientRect();
        let left = Math.min(x + 12, window.innerWidth - r.width - 8);
        let top = y - r.height - 12;
        if (top < 8) top = y + 18;
        this.card.style.left = Math.max(8, left) + 'px';
        this.card.style.top = top + 'px';
      } catch (e) {
        console.debug('PromptLint: minicard show failed', e);
      }
    }
    hide() {
      if (this.card) this.card.style.display = 'none';
    }
    destroy() {
      try {
        if (this.host) this.host.remove();
      } catch (e) { /* no-op */ }
      this._mounted = false;
    }
  }

  PL.ui = { COLORS, Z_BADGE, Z_PANEL, Z_CARD, severityColor, gradeColor, el, makeShadowHost, BASE_CSS, MiniCard };
})();
