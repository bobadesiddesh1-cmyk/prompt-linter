/**
 * PromptLint — content/panel.js
 *
 * The details panel that opens from the badge: score header, issue list
 * (click an issue → its underline pulses), rule-category toggles, and the
 * "Restructure prompt" feature with Copy / Insert-into-composer buttons.
 * All Shadow DOM; anchored above the badge; never touches host keyboard
 * handling. Footer states the privacy guarantee.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.Panel) return;
  const UI = PL.ui;

  const CATEGORY_LABELS = () => PL.rules.CATEGORIES;

  class Panel {
    /**
     * @param {object} cbs {onIssueClick(issue), onToggleCategory(key, on),
     *                      onRestructure() → string, onInsert(text), onCopy(text)}
     */
    constructor(cbs) {
      this.cbs = cbs;
      this.visible = false;
      this._anchor = null;

      const { host, shadow } = UI.makeShadowHost('promptlint-panel-host', UI.Z_PANEL);
      this.host = host;
      const style = document.createElement('style');
      style.textContent = UI.BASE_CSS + `
        .panel {
          position: fixed;
          width: 340px;
          max-height: 480px;
          display: none;
          flex-direction: column;
          background: var(--pl-bg);
          color: var(--pl-fg);
          border: 1px solid var(--pl-border);
          border-radius: 14px;
          box-shadow: var(--pl-shadow);
          pointer-events: auto;
          overflow: hidden;
        }
        .hdr { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--pl-border); }
        .score-ring {
          width: 40px; height: 40px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 14px; color: #fff; flex: none;
        }
        .hdr .grade { font-weight: 700; font-size: 14px; }
        .hdr .sub { color: var(--pl-fg2); font-size: 12px; }
        .hdr .close { margin-left: auto; background: none; border: none; color: var(--pl-fg2); font-size: 16px; cursor: pointer; padding: 4px; }
        .body { overflow-y: auto; padding: 10px 14px; flex: 1; }
        .sec-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--pl-fg2); margin: 10px 0 6px; }
        .issue { display: flex; gap: 8px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
        .issue:hover { background: var(--pl-bg2); }
        .issue .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; }
        .issue .name { font-weight: 600; }
        .issue .msg { color: var(--pl-fg2); font-size: 12px; }
        .empty { color: var(--pl-fg2); padding: 8px; text-align: center; }
        .cats { display: flex; flex-wrap: wrap; gap: 6px; }
        .cat { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px;
               border: 1px solid var(--pl-border); background: var(--pl-bg2); cursor: pointer; font-size: 12px; user-select: none; }
        .cat input { accent-color: var(--pl-accent); margin: 0; cursor: pointer; }
        .restructure-btn {
          width: 100%; margin-top: 12px; padding: 9px 0; border: none; border-radius: 9px;
          background: var(--pl-grad); color: #fff; font-weight: 700; font-size: 13px; cursor: pointer;
        }
        .restructure-btn:hover { filter: brightness(1.1); }
        .gain {
          display: none; align-items: center; justify-content: center; gap: 8px;
          margin-top: 10px; padding: 7px; border-radius: 9px; background: var(--pl-bg2);
          font-size: 12px; font-weight: 700;
        }
        .gain .from { color: var(--pl-fg2); text-decoration: line-through; }
        .gain .arrow { color: var(--pl-fg2); font-weight: 400; }
        .gain .to { font-size: 15px; }
        .gain .lbl { color: var(--pl-fg2); font-weight: 600; }
        .rewrite { margin-top: 10px; display: none; }
        .rewrite pre {
          background: var(--pl-bg2); border: 1px solid var(--pl-border); border-radius: 9px;
          padding: 10px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          white-space: pre-wrap; word-wrap: break-word; max-height: 160px; overflow-y: auto; color: var(--pl-fg);
        }
        .rewrite .actions { display: flex; gap: 8px; margin-top: 8px; }
        .rewrite .actions button {
          flex: 1; padding: 7px 0; border-radius: 8px; border: 1px solid var(--pl-border);
          background: var(--pl-bg2); color: var(--pl-fg); font-weight: 600; font-size: 12px; cursor: pointer;
        }
        .rewrite .actions button:hover { background: var(--pl-border); }
        .reset-pos {
          width: 100%; margin-top: 8px; padding: 6px 0; border-radius: 8px;
          border: 1px solid var(--pl-border); background: transparent; color: var(--pl-fg2);
          font-size: 11.5px; font-weight: 600; cursor: pointer;
        }
        .reset-pos:hover { background: var(--pl-bg2); color: var(--pl-fg); }
        .ftr { padding: 9px 14px; border-top: 1px solid var(--pl-border); color: var(--pl-fg2); font-size: 11px; text-align: center; }
        .ftr .brand {
          display: inline-flex; align-items: center; gap: 4px;
          font-weight: 700; text-decoration: none;
          background: var(--pl-grad); -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .ftr .brand:hover { text-decoration: underline; text-decoration-color: var(--pl-accent); }
        .ftr .priv { display: block; margin-top: 3px; opacity: .85; }
      `;
      shadow.appendChild(style);

      this.panel = UI.el('div', { class: 'pl-root panel' });
      shadow.appendChild(this.panel);
      this._build();
    }

    _build() {
      const p = this.panel;
      p.textContent = '';

      // Header
      this.scoreRing = UI.el('div', { class: 'score-ring', text: '–' });
      this.gradeEl = UI.el('div', { class: 'grade', text: 'PromptLint' });
      this.subEl = UI.el('div', { class: 'sub', text: 'Start typing to lint your prompt' });
      const hdrText = UI.el('div', {}, [this.gradeEl, this.subEl]);
      const close = UI.el('button', { class: 'close', text: '✕', 'aria-label': 'Close panel', onclick: () => this.hide() });
      p.appendChild(UI.el('div', { class: 'hdr' }, [this.scoreRing, hdrText, close]));

      // Body
      const body = UI.el('div', { class: 'body' });
      body.appendChild(UI.el('div', { class: 'sec-title', text: 'Issues' }));
      this.issueList = UI.el('div');
      body.appendChild(this.issueList);

      body.appendChild(UI.el('div', { class: 'sec-title', text: 'Rule categories' }));
      this.catsEl = UI.el('div', { class: 'cats' });
      body.appendChild(this.catsEl);

      this.restructureBtn = UI.el('button', {
        class: 'restructure-btn',
        text: '✦ Restructure prompt',
        onclick: () => this._doRestructure(),
      });
      body.appendChild(this.restructureBtn);

      this.resetPosBtn = UI.el('button', {
        class: 'reset-pos',
        text: '⤢ Reset badge position',
        title: 'Put the score badge back in the composer corner',
        onclick: () => this.cbs.onResetPosition && this.cbs.onResetPosition(),
      });
      body.appendChild(this.resetPosBtn);

      this.gainBox = UI.el('div', { class: 'gain' });
      body.appendChild(this.gainBox);

      this.rewriteBox = UI.el('div', { class: 'rewrite' });
      this.rewritePre = UI.el('pre');
      this.copyBtn = UI.el('button', { text: 'Copy', onclick: () => this._copy() });
      this.insertBtn = UI.el('button', { text: 'Insert into composer', onclick: () => this._insert() });
      this.rewriteBox.appendChild(this.rewritePre);
      this.rewriteBox.appendChild(UI.el('div', { class: 'actions' }, [this.copyBtn, this.insertBtn]));
      body.appendChild(this.rewriteBox);
      p.appendChild(body);

      // Footer — maker attribution + the privacy guarantee.
      const brand = (PL.storageApi && PL.storageApi.BRAND) || {};
      const ftr = UI.el('div', { class: 'ftr' });
      const link = UI.el('a', {
        class: 'brand',
        href: brand.url || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: '✦ ' + (brand.name || 'Built with Siddesh'),
        title: brand.line || '',
      });
      ftr.appendChild(link);
      ftr.appendChild(UI.el('span', { class: 'priv', text: '100% local · zero network calls · no account' }));
      p.appendChild(ftr);
    }

    _doRestructure() {
      try {
        const result = this.cbs.onRestructure ? this.cbs.onRestructure() : null;
        if (!result || !result.text) return;
        this.rewritePre.textContent = result.text;
        this.rewriteBox.style.display = 'block';
        this._lastRewrite = result.text;

        // Before → after score preview: shows the payoff at a glance.
        this.gainBox.textContent = '';
        if (typeof result.before === 'number' && typeof result.after === 'number') {
          this.gainBox.appendChild(UI.el('span', { class: 'lbl', text: 'Strength' }));
          this.gainBox.appendChild(UI.el('span', { class: 'from', text: String(result.before) }));
          this.gainBox.appendChild(UI.el('span', { class: 'arrow', text: '→' }));
          this.gainBox.appendChild(UI.el('span', {
            class: 'to',
            text: String(result.after),
            style: 'color:' + UI.gradeColor(result.after, true),
          }));
          this.gainBox.style.display = 'flex';
        } else {
          this.gainBox.style.display = 'none';
        }
      } catch (e) {
        console.debug('PromptLint: restructure failed', e);
      }
    }

    _copy() {
      const text = this._lastRewrite;
      if (!text) return;
      const done = () => {
        this.copyBtn.textContent = 'Copied ✓';
        setTimeout(() => (this.copyBtn.textContent = 'Copy'), 1200);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, () => this._copyFallback(text, done));
        } else {
          this._copyFallback(text, done);
        }
      } catch (e) {
        this._copyFallback(text, done);
      }
    }

    _copyFallback(text, done) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
        document.documentElement.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
      } catch (e) {
        console.debug('PromptLint: copy failed', e);
      }
    }

    _insert() {
      try {
        if (this._lastRewrite && this.cbs.onInsert) this.cbs.onInsert(this._lastRewrite);
      } catch (e) {
        console.debug('PromptLint: insert failed', e);
      }
    }

    /** Refresh score, issues and category toggles. */
    setData({ score, grade, issues, hasText, categories }) {
      try {
        this.scoreRing.style.background = UI.gradeColor(score, hasText);
        this.scoreRing.textContent = hasText ? String(score) : '–';
        this.gradeEl.textContent = hasText ? `${grade} prompt` : 'PromptLint';
        this.subEl.textContent = hasText
          ? issues.length
            ? `${issues.length} issue${issues.length === 1 ? '' : 's'} found`
            : 'No issues found'
          : 'Start typing to lint your prompt';

        this.issueList.textContent = '';
        if (!hasText || !issues.length) {
          this.issueList.appendChild(
            UI.el('div', { class: 'empty', text: hasText ? '✓ Nothing to flag' : 'Composer is empty' })
          );
        } else {
          for (const issue of issues) {
            const row = UI.el('div', {
              class: 'issue',
              title: 'Click to locate in your prompt',
              onclick: () => this.cbs.onIssueClick && this.cbs.onIssueClick(issue),
            }, [
              UI.el('span', { class: 'dot', style: 'background:' + UI.severityColor(issue.severity) }),
              UI.el('div', {}, [
                UI.el('div', { class: 'name', text: issue.ruleName }),
                UI.el('div', { class: 'msg', text: issue.message }),
              ]),
            ]);
            this.issueList.appendChild(row);
          }
        }

        // Category toggles
        this.catsEl.textContent = '';
        const labels = CATEGORY_LABELS();
        for (const key of Object.keys(labels)) {
          const cb = UI.el('input', { type: 'checkbox' });
          cb.checked = categories[key] !== false;
          cb.addEventListener('change', () => {
            this.cbs.onToggleCategory && this.cbs.onToggleCategory(key, cb.checked);
          });
          this.catsEl.appendChild(UI.el('label', { class: 'cat' }, [cb, UI.el('span', { text: labels[key] })]));
        }
      } catch (e) {
        console.debug('PromptLint: panel setData failed', e);
      }
    }

    /** Anchor the panel above/left of the badge rect. */
    positionNear(badgeRect) {
      this._anchor = badgeRect;
      if (!this.visible || !badgeRect) return;
      try {
        const r = this.panel.getBoundingClientRect();
        let left = badgeRect.right - r.width;
        let top = badgeRect.top - r.height - 10;
        if (top < 8) top = Math.min(badgeRect.bottom + 10, window.innerHeight - r.height - 8);
        left = Math.min(Math.max(8, left), window.innerWidth - r.width - 8);
        this.panel.style.left = left + 'px';
        this.panel.style.top = Math.max(8, top) + 'px';
      } catch (e) {
        console.debug('PromptLint: panel position failed', e);
      }
    }

    show() {
      this.visible = true;
      this.panel.style.display = 'flex';
      this.positionNear(this._anchor);
    }
    hide() {
      this.visible = false;
      this.panel.style.display = 'none';
    }
    toggle() {
      this.visible ? this.hide() : this.show();
    }
    destroy() {
      try { this.host.remove(); } catch (e) { /* no-op */ }
    }
  }

  PL.Panel = Panel;
})();
