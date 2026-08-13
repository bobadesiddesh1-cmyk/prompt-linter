/**
 * PromptLint — content/panel.js
 *
 * The details panel that opens from the badge. Two tabs:
 *   Issues  — score header, issue list with one-click quick-fix chips,
 *             rule-category toggles, "Restructure prompt" with a
 *             before → after score preview, Copy / Insert.
 *   Library — save the current prompt, reuse your saved snippets, and
 *             20 built-in starter templates.
 *
 * All Shadow DOM; anchored to the badge; never touches host keyboard
 * handling. Footer carries the maker attribution and privacy guarantee.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.Panel) return;
  const UI = PL.ui;

  class Panel {
    /**
     * @param {object} cbs {onIssueClick, onQuickFix, onToggleCategory, onRestructure,
     *                      onInsert, onResetPosition, onSaveSnippet, onUseText,
     *                      onDeleteSnippet, onRefreshLibrary}
     */
    constructor(cbs) {
      this.cbs = cbs;
      this.visible = false;
      this._anchor = null;
      this._tab = 'issues';

      const { host, shadow } = UI.makeShadowHost('promptlint-panel-host', UI.Z_PANEL);
      this.host = host;
      const style = document.createElement('style');
      style.textContent = UI.BASE_CSS + `
        .panel {
          position: fixed; width: 360px; max-height: 520px; display: none;
          flex-direction: column; background: var(--pl-bg); color: var(--pl-fg);
          border: 1px solid var(--pl-border); border-radius: 14px;
          box-shadow: var(--pl-shadow); pointer-events: auto; overflow: hidden;
        }
        .hdr { display: flex; align-items: center; gap: 10px; padding: 12px 14px 10px; }
        .score-ring {
          width: 40px; height: 40px; border-radius: 50%; display: flex;
          align-items: center; justify-content: center;
          font-weight: 800; font-size: 14px; color: #fff; flex: none;
        }
        .hdr .grade { font-weight: 700; font-size: 14px; }
        .hdr .sub { color: var(--pl-fg2); font-size: 12px; }
        .hdr .close { margin-left: auto; background: none; border: none; color: var(--pl-fg2); font-size: 16px; cursor: pointer; padding: 4px; }
        .tabs { display: flex; gap: 4px; padding: 0 14px; border-bottom: 1px solid var(--pl-border); }
        .tab {
          background: none; border: none; cursor: pointer; padding: 7px 10px 9px;
          font: 600 12.5px/1 inherit; color: var(--pl-fg2);
          border-bottom: 2px solid transparent; margin-bottom: -1px;
        }
        .tab:hover { color: var(--pl-fg); }
        .tab[aria-selected="true"] { color: var(--pl-accent); border-bottom-color: var(--pl-accent); }
        .body { overflow-y: auto; padding: 10px 14px; flex: 1; }
        .sec-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--pl-fg2); margin: 10px 0 6px; }
        .sec-title:first-child { margin-top: 2px; }
        .issue { display: flex; gap: 8px; padding: 7px 8px; border-radius: 8px; }
        .issue:hover { background: var(--pl-bg2); }
        .issue .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; }
        .issue .name { font-weight: 600; cursor: pointer; }
        .issue .msg { color: var(--pl-fg2); font-size: 12px; }
        .qf {
          margin-top: 5px; padding: 3px 9px; border-radius: 999px; cursor: pointer;
          border: 1px solid var(--pl-accent); background: transparent;
          color: var(--pl-accent); font: 700 11px/1.5 inherit;
        }
        .qf:hover { background: var(--pl-accent); color: #fff; }
        .empty { color: var(--pl-fg2); padding: 8px; text-align: center; }
        .cats { display: flex; flex-wrap: wrap; gap: 6px; }
        .cat { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px;
               border: 1px solid var(--pl-border); background: var(--pl-bg2); cursor: pointer; font-size: 12px; user-select: none; }
        .cat input { accent-color: var(--pl-accent); margin: 0; cursor: pointer; }
        .primary-btn {
          width: 100%; margin-top: 12px; padding: 9px 0; border: none; border-radius: 9px;
          background: var(--pl-grad); color: #fff; font-weight: 700; font-size: 13px; cursor: pointer;
        }
        .primary-btn:hover { filter: brightness(1.1); }
        .ghost-btn {
          width: 100%; margin-top: 8px; padding: 6px 0; border-radius: 8px;
          border: 1px solid var(--pl-border); background: transparent; color: var(--pl-fg2);
          font-size: 11.5px; font-weight: 600; cursor: pointer;
        }
        .ghost-btn:hover { background: var(--pl-bg2); color: var(--pl-fg); }
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
          white-space: pre-wrap; word-wrap: break-word; max-height: 150px; overflow-y: auto; color: var(--pl-fg);
        }
        .rewrite .actions { display: flex; gap: 8px; margin-top: 8px; }
        .rewrite .actions button {
          flex: 1; padding: 7px 0; border-radius: 8px; border: 1px solid var(--pl-border);
          background: var(--pl-bg2); color: var(--pl-fg); font-weight: 600; font-size: 12px; cursor: pointer;
        }
        .rewrite .actions button:hover { background: var(--pl-border); }
        /* Library */
        .tpl {
          display: flex; align-items: center; gap: 8px; padding: 7px 8px;
          border-radius: 8px; cursor: pointer;
        }
        .tpl:hover { background: var(--pl-bg2); }
        .tpl .t-name { font-weight: 600; flex: 1; min-width: 0; }
        .tpl .t-prev { color: var(--pl-fg2); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tpl .del {
          border: none; background: none; color: var(--pl-fg2); cursor: pointer;
          font-size: 13px; padding: 2px 4px; flex: none;
        }
        .tpl .del:hover { color: ${UI.COLORS.high}; }
        .ftr { padding: 9px 14px; border-top: 1px solid var(--pl-border); color: var(--pl-fg2); font-size: 11px; text-align: center; }
        .ftr .brand {
          display: inline-flex; align-items: center; gap: 4px; font-weight: 700; text-decoration: none;
          background: var(--pl-grad); -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .ftr .brand:hover { text-decoration: underline; text-decoration-color: var(--pl-accent); }
        .ftr .priv { display: block; margin-top: 3px; opacity: .85; }
        .ftr .keys { display: block; margin-top: 3px; opacity: .7; font-size: 10.5px; }
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
      p.appendChild(UI.el('div', { class: 'hdr' }, [
        this.scoreRing,
        UI.el('div', {}, [this.gradeEl, this.subEl]),
        UI.el('button', { class: 'close', text: '✕', 'aria-label': 'Close panel', onclick: () => this.hide() }),
      ]));

      // Tabs
      this.tabIssues = UI.el('button', { class: 'tab', text: 'Issues', 'aria-selected': 'true', onclick: () => this.setTab('issues') });
      this.tabLibrary = UI.el('button', { class: 'tab', text: '✦ Library', 'aria-selected': 'false', onclick: () => this.setTab('library') });
      p.appendChild(UI.el('div', { class: 'tabs' }, [this.tabIssues, this.tabLibrary]));

      // --- Issues body ---
      this.issuesBody = UI.el('div', { class: 'body' });
      this.issuesBody.appendChild(UI.el('div', { class: 'sec-title', text: 'Issues' }));
      this.issueList = UI.el('div');
      this.issuesBody.appendChild(this.issueList);
      this.issuesBody.appendChild(UI.el('div', { class: 'sec-title', text: 'Rule categories' }));
      this.catsEl = UI.el('div', { class: 'cats' });
      this.issuesBody.appendChild(this.catsEl);
      this.issuesBody.appendChild(UI.el('button', {
        class: 'primary-btn restructure-btn', text: '✦ Restructure prompt',
        onclick: () => this.doRestructure(),
      }));
      this.issuesBody.appendChild(UI.el('button', {
        class: 'ghost-btn reset-pos', text: '⤢ Reset badge position',
        onclick: () => this.cbs.onResetPosition && this.cbs.onResetPosition(),
      }));
      this.gainBox = UI.el('div', { class: 'gain' });
      this.issuesBody.appendChild(this.gainBox);
      this.rewriteBox = UI.el('div', { class: 'rewrite' });
      this.rewritePre = UI.el('pre');
      this.copyBtn = UI.el('button', { text: 'Copy', onclick: () => this._copy() });
      this.insertBtn = UI.el('button', { text: 'Insert into composer', onclick: () => this._insert() });
      this.rewriteBox.appendChild(this.rewritePre);
      this.rewriteBox.appendChild(UI.el('div', { class: 'actions' }, [this.copyBtn, this.insertBtn]));
      this.issuesBody.appendChild(this.rewriteBox);
      p.appendChild(this.issuesBody);

      // --- Library body ---
      this.libraryBody = UI.el('div', { class: 'body', style: 'display:none' });
      this.saveBtn = UI.el('button', {
        class: 'primary-btn save-btn', style: 'margin-top:2px', text: '＋ Save current prompt',
        onclick: async () => {
          if (!this.cbs.onSaveSnippet) return;
          const ok = await this.cbs.onSaveSnippet();
          this.saveBtn.textContent = ok ? 'Saved ✓' : 'Nothing to save';
          setTimeout(() => (this.saveBtn.textContent = '＋ Save current prompt'), 1300);
          if (ok) this.refreshLibrary();
        },
      });
      this.libraryBody.appendChild(this.saveBtn);
      this.savedTitle = UI.el('div', { class: 'sec-title', text: 'Your saved prompts' });
      this.savedList = UI.el('div');
      this.libraryBody.appendChild(this.savedTitle);
      this.libraryBody.appendChild(this.savedList);
      this.libraryBody.appendChild(UI.el('div', { class: 'sec-title', text: 'Starter templates' }));
      this.builtinList = UI.el('div');
      this.libraryBody.appendChild(this.builtinList);
      p.appendChild(this.libraryBody);

      // Footer
      const brand = (PL.storageApi && PL.storageApi.BRAND) || {};
      const ftr = UI.el('div', { class: 'ftr' });
      ftr.appendChild(UI.el('a', {
        class: 'brand', href: brand.url || '#', target: '_blank', rel: 'noopener noreferrer',
        text: '✦ ' + (brand.name || 'Built with Siddesh'), title: brand.line || '',
      }));
      ftr.appendChild(UI.el('span', { class: 'priv', text: '100% local · zero network calls · no account' }));
      ftr.appendChild(UI.el('span', { class: 'keys', text: 'Alt+Shift+P panel · Alt+Shift+R restructure · Alt+Shift+L library' }));
      p.appendChild(ftr);

      this._renderBuiltins();
    }

    setTab(tab) {
      this._tab = tab;
      const isIssues = tab === 'issues';
      this.tabIssues.setAttribute('aria-selected', String(isIssues));
      this.tabLibrary.setAttribute('aria-selected', String(!isIssues));
      this.issuesBody.style.display = isIssues ? 'block' : 'none';
      this.libraryBody.style.display = isIssues ? 'none' : 'block';
      if (!isIssues) this.refreshLibrary();
    }

    _renderBuiltins() {
      try {
        const items = (PL.library && PL.library.BUILTIN) || [];
        this.builtinList.textContent = '';
        let lastCat = '';
        for (const t of items) {
          if (t.cat !== lastCat) {
            lastCat = t.cat;
            this.builtinList.appendChild(UI.el('div', { class: 'sec-title', text: t.cat }));
          }
          this.builtinList.appendChild(UI.el('div', {
            class: 'tpl', title: 'Insert this template',
            onclick: () => this.cbs.onUseText && this.cbs.onUseText(t.text),
          }, [
            UI.el('span', { class: 't-name', text: t.title }),
            UI.el('span', { class: 't-prev', text: '↵' }),
          ]));
        }
      } catch (e) {
        console.debug('PromptLint: builtin render failed', e);
      }
    }

    /** Re-read saved snippets and repaint that list. */
    async refreshLibrary() {
      try {
        const list = (PL.library && (await PL.library.getSnippets())) || [];
        this.savedList.textContent = '';
        if (!list.length) {
          this.savedList.appendChild(UI.el('div', { class: 'empty', text: 'No saved prompts yet — save one above.' }));
          return;
        }
        for (const s of list) {
          const del = UI.el('button', { class: 'del', text: '🗑', title: 'Delete', 'aria-label': 'Delete snippet' });
          del.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (this.cbs.onDeleteSnippet) await this.cbs.onDeleteSnippet(s.id);
            this.refreshLibrary();
          });
          this.savedList.appendChild(UI.el('div', {
            class: 'tpl', title: 'Insert this prompt',
            onclick: () => this.cbs.onUseText && this.cbs.onUseText(s.text),
          }, [UI.el('span', { class: 't-name', text: s.title }), del]));
        }
      } catch (e) {
        console.debug('PromptLint: library refresh failed', e);
      }
    }

    doRestructure() {
      try {
        const result = this.cbs.onRestructure ? this.cbs.onRestructure() : null;
        if (!result || !result.text) return;
        this.setTab('issues');
        this.rewritePre.textContent = result.text;
        this.rewriteBox.style.display = 'block';
        this._lastRewrite = result.text;
        this.gainBox.textContent = '';
        if (typeof result.before === 'number' && typeof result.after === 'number') {
          this.gainBox.appendChild(UI.el('span', { class: 'lbl', text: 'Strength' }));
          this.gainBox.appendChild(UI.el('span', { class: 'from', text: String(result.before) }));
          this.gainBox.appendChild(UI.el('span', { class: 'arrow', text: '→' }));
          this.gainBox.appendChild(UI.el('span', {
            class: 'to', text: String(result.after), style: 'color:' + UI.gradeColor(result.after, true),
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

    /** Refresh score, issues (with quick-fix chips) and category toggles. */
    setData({ score, grade, issues, hasText, categories, quickFixFor }) {
      try {
        this.scoreRing.style.background = UI.gradeColor(score, hasText);
        this.scoreRing.textContent = hasText ? String(score) : '–';
        this.gradeEl.textContent = hasText ? `${grade} prompt` : 'PromptLint';
        this.subEl.textContent = hasText
          ? issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'} found` : 'No issues found'
          : 'Start typing to lint your prompt';

        this.issueList.textContent = '';
        if (!hasText || !issues.length) {
          this.issueList.appendChild(
            UI.el('div', { class: 'empty', text: hasText ? '✓ Nothing to flag' : 'Composer is empty' })
          );
        } else {
          for (const issue of issues) {
            const detail = UI.el('div', {}, [
              UI.el('div', {
                class: 'name', text: issue.ruleName, title: 'Click to locate in your prompt',
                onclick: () => this.cbs.onIssueClick && this.cbs.onIssueClick(issue),
              }),
              UI.el('div', { class: 'msg', text: issue.message }),
            ]);
            const qf = quickFixFor ? quickFixFor(issue) : null;
            if (qf) {
              detail.appendChild(UI.el('button', {
                class: 'qf', text: '⚡ ' + qf.label, title: qf.hint || '',
                onclick: () => this.cbs.onQuickFix && this.cbs.onQuickFix(issue),
              }));
            }
            this.issueList.appendChild(UI.el('div', { class: 'issue' }, [
              UI.el('span', { class: 'dot', style: 'background:' + UI.severityColor(issue.severity) }),
              detail,
            ]));
          }
        }

        this.catsEl.textContent = '';
        const labels = PL.rules.CATEGORIES;
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

    show(tab) {
      this.visible = true;
      this.panel.style.display = 'flex';
      if (tab) this.setTab(tab);
      this.positionNear(this._anchor);
    }
    hide() { this.visible = false; this.panel.style.display = 'none'; }
    toggle(tab) {
      if (this.visible && (!tab || tab === this._tab)) this.hide();
      else this.show(tab);
    }
    destroy() { try { this.host.remove(); } catch (e) { /* no-op */ } }
  }

  PL.Panel = Panel;
})();
