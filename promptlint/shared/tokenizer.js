/**
 * PromptLint — shared/tokenizer.js
 *
 * Pure text analysis. One tokenization pass produces an `analysis` object that
 * every rule and the restructure engine share — no rule re-tokenizes.
 *
 * All offsets are UTF-16 code-unit offsets into the ORIGINAL text, so they can
 * be mapped 1:1 onto DOM ranges / textarea positions. The normalized lowercase
 * string (`analysis.lower`) is produced only by same-length transforms
 * (toLowerCase + curly-quote straightening), so offsets found in `lower` are
 * valid in `text`.
 *
 * Loaded first in the content-script chain; attaches to window.PromptLint.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.tokenizer) return;

  // Word = letters/digits/apostrophes/hyphens/currency, e.g. "don't", "in-depth", "$50".
  const WORD_RE = /[A-Za-z0-9À-ɏ'’][A-Za-z0-9À-ɏ'’-]*/g;

  // Sentence terminators: run of . ! ? (plus trailing quotes/brackets), or newlines.
  const SENTENCE_END_RE = /[.!?]+["')\]]*(?:\s|$)|\n+/g;

  // Clause connectors per spec: and / also / then / plus, plus semicolons.
  // Bare commas are intentionally NOT split points (see DECISIONS.md #7).
  const CLAUSE_SPLIT_RE = /\b(?:and|also|then|plus)\b|;/gi;

  /** Same-length normalization: lowercase + straighten curly quotes. */
  function normalize(text) {
    return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  }

  /** Trim a [start,end) span's whitespace against the original text. */
  function trimSpan(text, start, end) {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    return { text: text.slice(start, end), start, end };
  }

  /** All words with offsets. */
  function words(text) {
    const out = [];
    WORD_RE.lastIndex = 0;
    let m;
    while ((m = WORD_RE.exec(text)) !== null) {
      out.push({
        text: m[0],
        lower: normalize(m[0]),
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    return out;
  }

  /** Sentences with offsets (non-empty after trim). */
  function sentences(text) {
    const out = [];
    let start = 0;
    SENTENCE_END_RE.lastIndex = 0;
    let m;
    while ((m = SENTENCE_END_RE.exec(text)) !== null) {
      const span = trimSpan(text, start, m.index + (m[0].startsWith('\n') ? 0 : m[0].replace(/\s+$/, '').length));
      // Keep the terminator punctuation inside the sentence span, not the newline.
      if (span.text) out.push(span);
      start = m.index + m[0].length;
      if (SENTENCE_END_RE.lastIndex === m.index) SENTENCE_END_RE.lastIndex++; // safety
    }
    if (start < text.length) {
      const span = trimSpan(text, start, text.length);
      if (span.text) out.push(span);
    }
    return out;
  }

  /** Clauses: each sentence further split on connectors/semicolons. */
  function clauses(text, sents) {
    const out = [];
    for (const s of sents) {
      const local = text.slice(s.start, s.end);
      const re = new RegExp(CLAUSE_SPLIT_RE.source, 'gi');
      let last = 0;
      let m;
      while ((m = re.exec(local)) !== null) {
        if (m.index > last) {
          const span = trimSpan(text, s.start + last, s.start + m.index);
          if (span.text) out.push(span);
        }
        last = m.index + m[0].length;
      }
      if (last < local.length) {
        const span = trimSpan(text, s.start + last, s.end);
        if (span.text) out.push(span);
      }
    }
    return out;
  }

  /**
   * The single shared analysis pass.
   * @param {string} text
   * @returns {{text:string, lower:string, trimmed:{text:string,start:number,end:number},
   *           words:Array, wordCount:number, sentences:Array, clauses:Array}}
   */
  function analyze(text) {
    text = String(text == null ? '' : text);
    const w = words(text);
    const s = sentences(text);
    return {
      text,
      lower: normalize(text),
      trimmed: trimSpan(text, 0, text.length),
      words: w,
      wordCount: w.length,
      sentences: s,
      clauses: clauses(text, s),
    };
  }

  /** Escape a string for use inside a RegExp. */
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build a case-insensitive whole-word/phrase regex from a lexicon.
   * Longest phrases first so "make it better" wins over "make".
   */
  function phraseRegex(phrases, flags = 'gi') {
    const parts = [...phrases].sort((a, b) => b.length - a.length).map(escapeRe);
    return new RegExp('\\b(?:' + parts.join('|') + ")\\b", flags);
  }

  PL.tokenizer = { analyze, words, sentences, clauses, normalize, trimSpan, phraseRegex, escapeRe };
})();
