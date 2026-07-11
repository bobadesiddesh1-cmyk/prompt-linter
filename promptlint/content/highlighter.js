/**
 * PromptLint — content/highlighter.js
 *
 * Two rendering paths:
 *
 * 1. ContentEditableHighlighter — CSS Custom Highlight API (CSS.highlights).
 *    All four target sites use contenteditable composers on Chrome-modern
 *    builds. The ::highlight() styles MUST live in the host document's
 *    stylesheet (Shadow DOM styles cannot paint host-document highlights),
 *    so one namespaced <style> tag is injected into <head> (DECISIONS #2).
 *
 * 2. TextareaHighlighter — mirror-overlay fallback for plain <textarea>
 *    composers: a fixed-position shadow-DOM div replicating the textarea's
 *    text metrics, with transparent text and visible dotted underlines,
 *    scroll-synced to the textarea.
 *
 * Both expose the same interface:
 *   getText() → string             (the exact text offsets refer to)
 *   apply(issues) / clear()
 *   pulse(issue)                   (flash one issue's range)
 *   issueAt(clientX, clientY)      (hover hit-testing) → issue | null
 *   destroy()
 *
 * Ranges are recomputed from scratch on every apply(); stale Highlight
 * objects are always cleared first, so edits can never leave ghost marks.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.highlighter) return;
  const UI = PL.ui;

  const HAS_HIGHLIGHT_API =
    typeof Highlight !== 'undefined' && typeof CSS !== 'undefined' && !!CSS.highlights;

  const GROUP = { high: 'promptlint-high', med: 'promptlint-med', low: 'promptlint-low' };
  const PULSE = 'promptlint-pulse';

  /* ------------------------------------------------------------------ */
  /* Host-document ::highlight() styles (injected once)                  */
  /* ------------------------------------------------------------------ */
  function injectHighlightStyles() {
    try {
      if (document.getElementById('promptlint-highlight-styles')) return;
      const style = document.createElement('style');
      style.id = 'promptlint-highlight-styles';
      style.textContent = `
        ::highlight(${GROUP.high}) { text-decoration: underline dotted ${UI.COLORS.high}; text-decoration-thickness: 2px; text-underline-offset: 3px; text-decoration-skip-ink: none; }
        ::highlight(${GROUP.med})  { text-decoration: underline dotted ${UI.COLORS.med};  text-decoration-thickness: 2px; text-underline-offset: 3px; text-decoration-skip-ink: none; }
        ::highlight(${GROUP.low})  { text-decoration: underline dotted ${UI.COLORS.low};  text-decoration-thickness: 2px; text-underline-offset: 3px; text-decoration-skip-ink: none; }
        ::highlight(${PULSE})      { background-color: rgba(124, 58, 237, .35); }
      `;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {
      console.debug('PromptLint: highlight style injection failed', e);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Contenteditable path                                                */
  /* ------------------------------------------------------------------ */

  // Elements that end a visual line/block → contribute '\n' to the snapshot.
  const BLOCK_TAGS = new Set([
    'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'TR', 'TABLE', 'SECTION', 'ARTICLE',
  ]);

  /**
   * Serialize a contenteditable into plain text + a segment map so that any
   * [start,end) offset in the text can be converted back to a DOM Range.
   * segs: [{start, end, node}] over text nodes, in document order.
   */
  function buildSnapshot(root) {
    let text = '';
    const segs = [];
    const nodeIndex = new Map(); // text node → seg (for hover offset lookup)

    (function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.nodeValue;
        if (t && t.length) {
          const seg = { start: text.length, end: text.length + t.length, node };
          segs.push(seg);
          nodeIndex.set(node, seg);
          text += t;
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      if (tag === 'BR') { text += '\n'; return; }
      if (tag === 'STYLE' || tag === 'SCRIPT') return;
      for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
      if (BLOCK_TAGS.has(tag) && text.length && !text.endsWith('\n')) text += '\n';
    })(root);

    return { text, segs, nodeIndex };
  }

  /** Locate (node, nodeOffset) for a text offset; snaps into the nearest segment. */
  function pointAt(snapshot, offset, preferEnd) {
    const segs = snapshot.segs;
    if (!segs.length) return null;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (offset < s.start) return { node: s.node, offset: 0 }; // offset fell in a '\n' gap
      const inEnd = preferEnd ? offset <= s.end : offset < s.end;
      if (inEnd && offset >= s.start) return { node: s.node, offset: offset - s.start };
    }
    const last = segs[segs.length - 1];
    return { node: last.node, offset: last.end - last.start };
  }

  class ContentEditableHighlighter {
    constructor(el) {
      this.el = el;
      this.type = 'contenteditable';
      this.snapshot = { text: '', segs: [], nodeIndex: new Map() };
      this.issues = [];
      this._pulseTimer = null;
      injectHighlightStyles();
    }

    getText() {
      try {
        this.snapshot = buildSnapshot(this.el);
        return this.snapshot.text;
      } catch (e) {
        console.debug('PromptLint: snapshot failed', e);
        return '';
      }
    }

    _rangeFor(start, end) {
      const a = pointAt(this.snapshot, start, false);
      const b = pointAt(this.snapshot, end, true);
      if (!a || !b) return null;
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      return range.collapsed ? null : range;
    }

    apply(issues) {
      this.clear(); // always drop stale Highlight objects first
      this.issues = issues || [];
      if (!HAS_HIGHLIGHT_API) return; // graceful no-op on very old Chrome
      try {
        const bySeverity = { high: [], med: [], low: [] };
        for (const issue of this.issues) {
          const r = this._rangeFor(issue.start, issue.end);
          if (r) {
            bySeverity[issue.severity].push(r);
            issue._range = r;
          }
        }
        for (const sev of Object.keys(bySeverity)) {
          if (bySeverity[sev].length) {
            CSS.highlights.set(GROUP[sev], new Highlight(...bySeverity[sev]));
          }
        }
      } catch (e) {
        console.debug('PromptLint: highlight apply failed', e);
      }
    }

    clear() {
      if (!HAS_HIGHLIGHT_API) return;
      try {
        for (const name of Object.values(GROUP)) CSS.highlights.delete(name);
        CSS.highlights.delete(PULSE);
      } catch (e) {
        console.debug('PromptLint: highlight clear failed', e);
      }
    }

    pulse(issue) {
      if (!HAS_HIGHLIGHT_API) return;
      try {
        const r = issue._range && !issue._range.collapsed ? issue._range : this._rangeFor(issue.start, issue.end);
        if (!r) return;
        clearTimeout(this._pulseTimer);
        let on = true;
        let flashes = 0;
        const tick = () => {
          try {
            if (on) CSS.highlights.set(PULSE, new Highlight(r));
            else CSS.highlights.delete(PULSE);
            on = !on;
            if (++flashes < 6) this._pulseTimer = setTimeout(tick, 220);
            else CSS.highlights.delete(PULSE);
          } catch (e) { /* no-op */ }
        };
        tick();
      } catch (e) {
        console.debug('PromptLint: pulse failed', e);
      }
    }

    /** Map a mouse position to the topmost issue under it (or null). */
    issueAt(x, y) {
      try {
        const caret = document.caretRangeFromPoint
          ? document.caretRangeFromPoint(x, y)
          : null;
        if (!caret) return null;
        let node = caret.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) {
          node = node.childNodes[Math.min(caret.startOffset, node.childNodes.length - 1)];
          if (!node || node.nodeType !== Node.TEXT_NODE) return null;
        }
        const seg = this.snapshot.nodeIndex.get(node);
        if (!seg) return null;
        const offset = seg.start + caret.startOffset;
        // Highest severity first (this.issues is already severity-sorted),
        // and among equals prefer the tightest range.
        let best = null;
        for (const i of this.issues) {
          if (offset >= i.start && offset < i.end) {
            if (!best || (i.end - i.start) < (best.end - best.start)) {
              if (!best) best = i;
              else if (best.severity === i.severity) best = i;
            }
          }
        }
        return best;
      } catch (e) {
        return null;
      }
    }

    destroy() {
      this.clear();
      clearTimeout(this._pulseTimer);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Textarea mirror path                                                */
  /* ------------------------------------------------------------------ */

  // Text-metric styles copied from the textarea so the mirror wraps identically.
  const MIRROR_STYLES = [
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing', 'text-transform',
    'text-indent', 'text-align', 'padding-top', 'padding-right',
    'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width',
    'border-bottom-width', 'border-left-width', 'box-sizing', 'direction',
  ];

  class TextareaHighlighter {
    constructor(el) {
      this.el = el;
      this.type = 'textarea';
      this.issues = [];
      this._spans = []; // [{span, issue}]
      this._raf = 0;
      this._destroyed = false;

      const made = UI.makeShadowHost('promptlint-mirror-host', UI.Z_BADGE - 1);
      this.host = made.host;
      const style = document.createElement('style');
      style.textContent = `
        .mirror {
          position: fixed;
          overflow: hidden;
          pointer-events: none;
          color: transparent;
          background: none;
          border-style: solid;
          border-color: transparent;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
          z-index: 0;
        }
        .mirror .inner { position: relative; }
        .u { text-decoration-line: underline; text-decoration-style: dotted; text-decoration-thickness: 2px; text-underline-offset: 3px; text-decoration-skip-ink: none; border-radius: 2px; }
        .u-high { text-decoration-color: ${UI.COLORS.high}; }
        .u-med  { text-decoration-color: ${UI.COLORS.med}; }
        .u-low  { text-decoration-color: ${UI.COLORS.low}; }
        .pulse  { background: rgba(124, 58, 237, .35); }
      `;
      made.shadow.appendChild(style);
      this.mirror = document.createElement('div');
      this.mirror.className = 'mirror';
      this.inner = document.createElement('div');
      this.inner.className = 'inner';
      this.mirror.appendChild(this.inner);
      made.shadow.appendChild(this.mirror);

      this._onScroll = () => this._syncScroll();
      this._onReposition = () => this._scheduleSync();
      try {
        el.addEventListener('scroll', this._onScroll, { passive: true });
        window.addEventListener('scroll', this._onReposition, { passive: true, capture: true });
        window.addEventListener('resize', this._onReposition, { passive: true });
        this._ro = new ResizeObserver(() => this._scheduleSync());
        this._ro.observe(el);
      } catch (e) {
        console.debug('PromptLint: mirror listeners failed', e);
      }
      this._sync();
    }

    getText() {
      try { return this.el.value || ''; } catch (e) { return ''; }
    }

    _scheduleSync() {
      if (this._raf || this._destroyed) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this._sync();
      });
    }

    _sync() {
      if (this._destroyed) return;
      try {
        const rect = this.el.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0;
        this.mirror.style.display = visible ? 'block' : 'none';
        if (!visible) return;
        const cs = getComputedStyle(this.el);
        for (const prop of MIRROR_STYLES) this.mirror.style.setProperty(prop, cs.getPropertyValue(prop));
        this.mirror.style.left = rect.left + 'px';
        this.mirror.style.top = rect.top + 'px';
        this.mirror.style.width = rect.width + 'px';
        this.mirror.style.height = rect.height + 'px';
        this._syncScroll();
      } catch (e) {
        console.debug('PromptLint: mirror sync failed', e);
      }
    }

    _syncScroll() {
      try {
        this.mirror.scrollTop = this.el.scrollTop;
        this.mirror.scrollLeft = this.el.scrollLeft;
      } catch (e) { /* no-op */ }
    }

    apply(issues) {
      this.issues = issues || [];
      try {
        this.inner.textContent = '';
        this._spans = [];
        const text = this.getText();
        // Mirror overlays can't nest — render non-overlapping, severity-first
        // winners (DECISIONS #12). Panel still lists everything.
        const sevRank = { high: 0, med: 1, low: 2 };
        const sorted = [...this.issues].sort(
          (a, b) => a.start - b.start || sevRank[a.severity] - sevRank[b.severity]
        );
        const chosen = [];
        let cursor = 0;
        for (const i of sorted) {
          if (i.start >= cursor && i.end <= text.length) {
            chosen.push(i);
            cursor = i.end;
          }
        }
        let pos = 0;
        for (const i of chosen) {
          if (i.start > pos) this.inner.appendChild(document.createTextNode(text.slice(pos, i.start)));
          const span = document.createElement('span');
          span.className = 'u u-' + i.severity;
          span.textContent = text.slice(i.start, i.end);
          this.inner.appendChild(span);
          this._spans.push({ span, issue: i });
          pos = i.end;
        }
        if (pos < text.length) this.inner.appendChild(document.createTextNode(text.slice(pos)));
        this._sync();
      } catch (e) {
        console.debug('PromptLint: mirror apply failed', e);
      }
    }

    clear() {
      try {
        this.inner.textContent = '';
        this._spans = [];
        this.issues = [];
      } catch (e) { /* no-op */ }
    }

    pulse(issue) {
      try {
        const hit = this._spans.find((s) => s.issue === issue) ||
          this._spans.find((s) => s.issue.id === issue.id && s.issue.start === issue.start);
        if (!hit) return;
        let flashes = 0;
        const tick = () => {
          hit.span.classList.toggle('pulse');
          if (++flashes < 6) setTimeout(tick, 220);
          else hit.span.classList.remove('pulse');
        };
        tick();
      } catch (e) { /* no-op */ }
    }

    issueAt(x, y) {
      try {
        for (const { span, issue } of this._spans) {
          for (const r of span.getClientRects()) {
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return issue;
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    destroy() {
      this._destroyed = true;
      try {
        this.el.removeEventListener('scroll', this._onScroll);
        window.removeEventListener('scroll', this._onReposition, { capture: true });
        window.removeEventListener('resize', this._onReposition);
        if (this._ro) this._ro.disconnect();
        cancelAnimationFrame(this._raf);
        this.host.remove();
      } catch (e) { /* no-op */ }
    }
  }

  /** Factory: pick the right path for a detected composer. */
  function create(composerInfo) {
    if (composerInfo.type === 'textarea') return new TextareaHighlighter(composerInfo.el);
    return new ContentEditableHighlighter(composerInfo.el);
  }

  PL.highlighter = { create, HAS_HIGHLIGHT_API };
})();
