/**
 * PromptLint — content/main.js
 *
 * Orchestrator. Loads settings, detects the composer via the site adapter
 * (with generic fallback), runs the 700 ms-debounced lint loop, and wires
 * highlighter + badge + panel + hover mini-card together.
 *
 * Invariants enforced here:
 *  - NO keydown/keypress/keyup listener is ever attached to the composer or
 *    document. Enter/send is physically untouchable by this extension.
 *  - Every adapter call and DOM operation is wrapped; any failure is a
 *    silent no-op with console.debug only. If no composer is found the
 *    extension does nothing at all on the page.
 *  - Insert-into-composer uses select-all + execCommand('insertText') so the
 *    host page's native undo (Ctrl+Z) restores the user's original text.
 */
(() => {
  'use strict';
  const PL = window.PromptLint;
  if (!PL || PL._mainStarted) return;
  PL._mainStarted = true;

  const DEBOUNCE_MS = 700;
  const DETECT_DEBOUNCE_MS = 800;
  const KNOWN_SITES = ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai'];

  const state = {
    settings: null,
    composer: null, // {el, type}
    hl: null,
    badge: null,
    panel: null,
    miniCard: null,
    lintTimer: 0,
    detectTimer: 0,
    lastUrl: location.href,
    lastAnalysis: null,
    lastIssues: [],
    lastScore: 100,
    pendingText: null, // latest non-empty composer text, for history on clear
    active: false,
    observer: null,
    urlPoll: 0,
    onInput: null,
    onMouseMove: null,
    onMouseLeave: null,
  };

  function siteId() {
    const host = location.hostname.replace(/^www\./, '');
    return KNOWN_SITES.find((s) => host === s || host.endsWith('.' + s)) || host;
  }

  function siteEnabled() {
    const s = state.settings;
    if (!s || !s.enabled) return false;
    const id = siteId();
    return s.sites[id] !== false;
  }

  /* ------------------------------------------------------------------ */
  /* Composer detection                                                  */
  /* ------------------------------------------------------------------ */

  function findComposer() {
    try {
      const adapter = PL.adapters[siteId()];
      if (adapter) {
        const found = adapter.findComposer();
        if (found && found.el) return found;
      }
      return PL.adapters.generic ? PL.adapters.generic.findComposer() : null;
    } catch (e) {
      console.debug('PromptLint: composer detection failed', e);
      return null;
    }
  }

  function scheduleDetect() {
    clearTimeout(state.detectTimer);
    state.detectTimer = setTimeout(() => {
      try {
        if (!siteEnabled()) return;
        const current = state.composer;
        if (current && current.el.isConnected && findStillValid(current)) return;
        const found = findComposer();
        if (found) attach(found);
        else if (current) detachComposer(); // composer went away, keep watching
      } catch (e) {
        console.debug('PromptLint: detect pass failed', e);
      }
    }, DETECT_DEBOUNCE_MS);
  }

  /**
   * Some composers (e.g. Perplexity's Lexical editor) render their
   * placeholder as real text nodes, which would otherwise lint as a prompt
   * and light the badge green on an empty box. Treat text identical to the
   * composer's declared placeholder as empty.
   */
  function isPlaceholderText(el, trimmedText) {
    try {
      const sources = [el, el.firstElementChild].filter(Boolean);
      for (const node of sources) {
        for (const attr of ['placeholder', 'data-placeholder', 'aria-placeholder']) {
          const ph = (node.getAttribute && node.getAttribute(attr) || '').trim();
          if (ph && ph === trimmedText) return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function findStillValid(c) {
    try {
      const r = c.el.getBoundingClientRect();
      return r.width > 0 || r.height > 0 || document.activeElement === c.el;
    } catch (e) {
      return false;
    }
  }

  function startWatching() {
    // SPA navigation: popstate + light URL poll + DOM settle observer (DECISIONS #3).
    try {
      window.addEventListener('popstate', scheduleDetect, { passive: true });
      state.urlPoll = setInterval(() => {
        if (location.href !== state.lastUrl) {
          state.lastUrl = location.href;
          scheduleDetect();
        }
      }, 1000);
      state.observer = new MutationObserver(() => {
        if (!state.composer || !state.composer.el.isConnected) scheduleDetect();
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {
      console.debug('PromptLint: watchers failed', e);
    }
    scheduleDetect();
  }

  /* ------------------------------------------------------------------ */
  /* Attach / detach                                                     */
  /* ------------------------------------------------------------------ */

  function attach(composerInfo) {
    try {
      detachComposer();
      state.composer = composerInfo;
      state.hl = PL.highlighter.create(composerInfo);
      state.miniCard = state.miniCard || new PL.ui.MiniCard();

      state.panel = new PL.Panel({
        onIssueClick: (issue) => {
          try { state.hl && state.hl.pulse(issue); } catch (e) { /* no-op */ }
        },
        onToggleCategory: async (key, on) => {
          state.settings = await PL.storageApi.updateSettings({ categories: { [key]: on } });
          lint();
        },
        onRestructure: () => {
          const analysis = PL.tokenizer.analyze(state.hl ? state.hl.getText() : '');
          if (!analysis.trimmed.text) return '';
          return PL.restructure(analysis).text;
        },
        onInsert: (text) => insertIntoComposer(text),
      });

      state.badge = new PL.Badge(
        composerInfo.el,
        () => state.panel && state.panel.toggle(),
        (rect) => state.panel && state.panel.positionNear(rect)
      );

      // Text changes → debounced lint. 'input' fires for both contenteditable
      // and textarea. Deliberately NO key listeners (see file header).
      // The cheap synchronous text capture keeps history accurate even when
      // the composer is cleared (sent) faster than the lint debounce.
      state.onInput = () => {
        try {
          const t = state.hl ? state.hl.getText() : '';
          if (t.trim() && !isPlaceholderText(composerInfo.el, t.trim())) state.pendingText = t;
        } catch (e) { /* no-op */ }
        clearTimeout(state.lintTimer);
        state.lintTimer = setTimeout(lint, DEBOUNCE_MS);
      };
      composerInfo.el.addEventListener('input', state.onInput, { passive: true });

      // Hover mini-card (throttled by rAF).
      let hoverRaf = 0;
      state.onMouseMove = (e) => {
        if (hoverRaf) return;
        hoverRaf = requestAnimationFrame(() => {
          hoverRaf = 0;
          try {
            const issue = state.hl && state.lastIssues.length ? state.hl.issueAt(e.clientX, e.clientY) : null;
            if (issue) state.miniCard.show(issue, e.clientX, e.clientY);
            else state.miniCard.hide();
          } catch (err) { /* no-op */ }
        });
      };
      state.onMouseLeave = () => state.miniCard && state.miniCard.hide();
      composerInfo.el.addEventListener('mousemove', state.onMouseMove, { passive: true });
      composerInfo.el.addEventListener('mouseleave', state.onMouseLeave, { passive: true });

      lint(); // initial pass

      // First-ever run on this browser: show the "what is this" callout once.
      PL.storageApi.getLocalFlag('promptlint_onboarded').then((seen) => {
        if (!seen && state.badge) {
          state.badge.showCallout(() => PL.storageApi.setLocalFlag('promptlint_onboarded', true));
        }
      });
    } catch (e) {
      console.debug('PromptLint: attach failed', e);
      detachComposer();
    }
  }

  function detachComposer() {
    try {
      if (state.composer && state.onInput) {
        state.composer.el.removeEventListener('input', state.onInput);
        state.composer.el.removeEventListener('mousemove', state.onMouseMove);
        state.composer.el.removeEventListener('mouseleave', state.onMouseLeave);
      }
      clearTimeout(state.lintTimer);
      if (state.hl) state.hl.destroy();
      if (state.badge) state.badge.destroy();
      if (state.panel) state.panel.destroy();
      if (state.miniCard) state.miniCard.hide();
    } catch (e) {
      console.debug('PromptLint: detach failed', e);
    }
    state.composer = null;
    state.hl = null;
    state.badge = null;
    state.panel = null;
    state.lastIssues = [];
  }

  function teardownAll() {
    detachComposer();
    if (state.miniCard) {
      state.miniCard.destroy();
      state.miniCard = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lint loop                                                           */
  /* ------------------------------------------------------------------ */

  function lint() {
    if (!state.hl || !siteEnabled()) return;
    try {
      const text = state.hl.getText();
      const analysis = PL.tokenizer.analyze(text);
      const hasText =
        analysis.trimmed.text.length > 0 &&
        !isPlaceholderText(state.composer.el, analysis.trimmed.text);

      // History: non-empty → empty transition ≈ "prompt was sent" (DECISIONS #10).
      // Score the text captured by the input handler — the true final draft,
      // even if the user sent it before the lint debounce fired.
      if (!hasText && state.pendingText) {
        const finalAnalysis = PL.tokenizer.analyze(state.pendingText);
        if (finalAnalysis.wordCount >= 2) {
          const finalIssues = PL.rules.run(finalAnalysis, state.settings.categories);
          const finalScore = PL.rules.score(finalIssues);
          PL.storageApi.pushHistory({
            score: finalScore.score,
            grade: finalScore.grade,
            site: siteId(),
            snippet: finalAnalysis.trimmed.text.slice(0, 40),
            ts: Date.now(),
          });
        }
        state.pendingText = null;
      }

      const issues = hasText ? PL.rules.run(analysis, state.settings.categories) : [];
      const { score, grade } = PL.rules.score(issues);

      state.lastAnalysis = analysis;
      state.lastIssues = issues;
      state.lastScore = score;
      if (hasText) state.pendingText = text;

      if (hasText) state.hl.apply(issues);
      else state.hl.clear();
      if (state.badge) state.badge.update(score, issues.length, hasText);
      if (state.panel) {
        state.panel.setData({ score, grade, issues, hasText, categories: state.settings.categories });
      }
    } catch (e) {
      console.debug('PromptLint: lint pass failed', e);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Insert-into-composer (undo-preserving)                              */
  /* ------------------------------------------------------------------ */

  function insertIntoComposer(text) {
    const c = state.composer;
    if (!c) return;
    try {
      c.el.focus();
      if (c.type === 'textarea') {
        c.el.setSelectionRange(0, c.el.value.length);
      } else {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(c.el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      // execCommand goes through the browser's editing pipeline → the site's
      // native undo stack records it; Ctrl+Z restores the original prompt.
      const ok = document.execCommand('insertText', false, text);
      if (!ok) {
        // Editor blocked execCommand (rare) — fall back to synthetic input.
        if (c.type === 'textarea') {
          c.el.value = text;
        } else {
          c.el.textContent = text;
        }
        c.el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
      clearTimeout(state.lintTimer);
      state.lintTimer = setTimeout(lint, 100);
    } catch (e) {
      console.debug('PromptLint: insert failed', e);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Enable / disable lifecycle                                          */
  /* ------------------------------------------------------------------ */

  function applyEnabledState() {
    if (siteEnabled()) {
      if (!state.active) {
        state.active = true;
        scheduleDetect();
      } else if (!state.composer) {
        scheduleDetect();
      } else {
        lint();
      }
    } else {
      state.active = false;
      teardownAll();
    }
  }

  async function init() {
    try {
      state.settings = await PL.storageApi.getSettings();
      PL.storageApi.onSettingsChanged((next) => {
        state.settings = next;
        applyEnabledState();
      });
      startWatching();
      state.active = siteEnabled();
      if (!state.active) return; // watchers stay armed; storage change can activate later
    } catch (e) {
      console.debug('PromptLint: init failed', e);
    }
  }

  init();
})();
