/**
 * PromptLint — content/rules.js
 *
 * All 9 lint rules as pure functions over the shared tokenizer analysis.
 * Every lexicon ships complete inline. All regexes are precompiled at load
 * time; a lint pass over a 1,000-word prompt is a handful of linear regex
 * scans over one string (< 30 ms with large margin).
 *
 * Each rule returns issues: {id, ruleName, category, severity, start, end, message, fix}.
 * Severity: 'high' | 'med' | 'low'. Offsets index analysis.text.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.rules) return;
  const T = PL.tokenizer;

  /* ------------------------------------------------------------------ *
   * LEXICONS (complete, inline)
   * ------------------------------------------------------------------ */

  // Rule 1 — generic verbs with no object detail.
  const GENERIC_VERBS = [
    'improve', 'fix', 'help', 'optimize', 'optimise', 'enhance', 'polish',
    'make better', 'make it better', 'make this better', 'make that better',
    'look at', 'check', 'review', 'clean up', 'sort out',
  ];

  // Words that carry no object detail (used to test "no object detail").
  const NON_SUBSTANTIVE = new Set([
    // pronouns / demonstratives
    'this', 'that', 'it', 'these', 'those', 'me', 'us', 'you', 'i', 'we',
    'my', 'our', 'your', 'mine', 'ours', 'yours', 'them', 'they',
    // articles / glue
    'a', 'an', 'the', 'some', 'any', 'all', 'to', 'of', 'for', 'with', 'and',
    'or', 'but', 'on', 'in', 'at', 'up', 'out', 'so', 'be', 'is', 'are',
    // politeness / hedges / vague nouns
    'please', 'kindly', 'can', 'could', 'would', 'should', 'will', 'just',
    'maybe', 'bit', 'little', 'more', 'better', 'good', 'nice', 'thing',
    'things', 'stuff', 'something', 'anything', 'everything', 'now', 'asap',
    'quickly', 'really', 'very',
    // the generic verbs themselves (single-word forms)
    'improve', 'fix', 'help', 'optimize', 'optimise', 'enhance', 'polish',
    'make', 'look', 'check', 'review', 'clean', 'sort',
  ]);

  // Rule 2 — generative verbs that produce an output artifact.
  const GENERATIVE_VERBS = [
    'write', 'create', 'generate', 'draft', 'build', 'summarize', 'summarise',
    'list', 'compose', 'produce', 'craft', 'make', 'prepare', 'develop',
    'outline', 'design',
  ];

  // Rule 2 — signals that an output format was specified.
  const FORMAT_SIGNALS = [
    'table', 'bullet', 'bullets', 'bullet points', 'bulleted', 'words',
    'paragraph', 'paragraphs', 'json', 'csv', 'xml', 'yaml', 'html',
    'markdown', 'steps', 'step-by-step', 'tone', 'format', 'formatted',
    'numbered list', 'numbered', 'outline form', 'headings', 'subheadings',
    'sections', 'code block', 'sentences', 'one-liner', 'tl;dr', 'tldr',
    'slide', 'slides', 'template', 'checklist', 'pros and cons',
  ];
  // A number counts as a format signal only with a countable unit (DECISIONS #8).
  const COUNT_UNIT_RE =
    /\b\d+\s*(?:words?|bullets?|bullet points?|points?|paragraphs?|sentences?|lines?|items?|steps?|examples?|options?|ideas?|sections?|pages?|characters?|chars?|slides?|headings?|rows?|columns?)\b/i;

  // Rule 3 — task verbs (any actionable ask) & context markers.
  const TASK_VERBS = GENERATIVE_VERBS.concat(GENERIC_VERBS, [
    'explain', 'describe', 'analyze', 'analyse', 'translate', 'compare',
    'rewrite', 'edit', 'plan', 'debug', 'refactor', 'brainstorm', 'recommend',
    'suggest', 'give', 'provide', 'find', 'research', 'calculate', 'convert',
    'classify', 'extract', 'identify', 'rank', 'evaluate', 'answer', 'solve',
    'code', 'implement', 'test',
  ]);
  const CONTEXT_MARKERS = [
    'for', 'about', 'based on', 'given', 'my', 'our', 'background',
    'here is', "here's", 'attached', 'below', 'above', 'i am', "i'm",
    'we are', "we're", 'using', 'according to',
  ];
  const CONTEXT_COLON_RE = /\b(?:context|background)\s*:/i;

  // Rule 4 — demonstratives that dangle without pasted content.
  const DEMONSTRATIVES = new Set(['this', 'that', 'it', 'these', 'those']);

  // Rule 5 — imperative verbs that can open an "ask" clause.
  const IMPERATIVE_VERBS = new Set([
    'write', 'create', 'generate', 'draft', 'build', 'summarize', 'summarise',
    'list', 'compose', 'produce', 'craft', 'make', 'prepare', 'develop',
    'outline', 'design', 'improve', 'fix', 'help', 'optimize', 'optimise',
    'enhance', 'polish', 'check', 'review', 'explain', 'describe', 'analyze',
    'analyse', 'translate', 'compare', 'rewrite', 'edit', 'plan', 'debug',
    'refactor', 'brainstorm', 'recommend', 'suggest', 'give', 'provide',
    'add', 'remove', 'delete', 'update', 'change', 'convert', 'find',
    'search', 'research', 'calculate', 'compute', 'code', 'implement',
    'test', 'format', 'sort', 'rank', 'classify', 'extract', 'identify',
    'propose', 'show', 'tell', 'answer', 'solve', 'evaluate', 'name',
    'include', 'turn', 'condense', 'shorten', 'expand', 'proofread',
  ]);
  // Words skipped before checking a clause's leading verb.
  const CLAUSE_LEADIN = new Set(['please', 'kindly', 'also', 'then', 'and', 'now', 'next', 'finally', 'lastly', 'plus', 'can', 'could', 'would', 'you']);

  // Rule 6 — token-waste filler phrases.
  const FILLER_PHRASES = [
    'please kindly',
    "if you don't mind",
    'i was wondering if you could',
    'i was wondering if you can',
    'sorry to bother you',
    'would it be possible for you to',
    'if it is not too much trouble',
    "if it's not too much trouble",
    'i would really appreciate it if you could',
    'thanks in advance',
  ];

  // Rule 7 — open-ended asks & success-criteria signals.
  const OPEN_ENDED = [
    'ideas', 'suggestions', 'options', 'recommend', 'recommendations',
    'alternatives', 'possibilities', 'brainstorm',
  ];
  const CRITERIA_RE = new RegExp(
    [
      '\\btop\\s+\\d+\\b',
      '\\b\\d+\\b', // any explicit quantity (spec: "without quantity or criteria")
      '\\branked?(?:\\s+by)?\\b',
      '\\bordered\\s+by\\b',
      '\\bbest\\s+for\\b',
      '\\bmost\\s+(?:important|relevant|popular|affordable)\\b',
      '\\bunder\\s*[₹$€£]',
      '[₹$€£]\\s*\\d',
      '\\bat\\s+(?:least|most)\\b',
      '\\bno\\s+more\\s+than\\b',
      '\\bcriteri(?:a|on)\\b',
      '\\bprioriti[sz]e\\b',
      '\\bsorted\\s+by\\b',
      '\\bbudget\\b',
    ].join('|'),
    'i'
  );

  // Rule 8 — brevity vs depth. "short story/film" is a genre, not brevity (DECISIONS #6).
  const BREVITY_RE = /\b(?:brief(?:ly)?|short(?!\s+(?:stor(?:y|ies)|films?))|concise(?:ly)?|quick(?:ly)?|succinct(?:ly)?|terse|one-liner|tl;dr|tldr)\b/gi;
  const DEPTH_RE = /\b(?:detailed|comprehensive(?:ly)?|in-depth|thorough(?:ly)?|exhaustive(?:ly)?|extensive(?:ly)?|elaborate|deep dive|long-form|lengthy|full breakdown)\b/gi;

  // Rule 9 — content-creation asks & audience/role signals.
  const CONTENT_VERB_RE =
    /\b(?:write|draft|compose|craft|blog)\b|\b(?:create|generate|produce|make|prepare|develop)\s+(?:a|an|the|some|me\s+a|me\s+an)?\s*(?:blog(?:\s+post)?|post|article|email|e-mail|essay|copy|caption|tweet|thread|newsletter|script|speech|bio|description|headline|title|ad|advert|landing\s+page|report|story|poem|content|social\s+media|linkedin|presentation|pitch|memo|cover\s+letter|resume|cv)\b/gi;
  const AUDIENCE_RE =
    /\bfor\s+[a-z0-9]|\bas\s+an?\s+[a-z]|\bact\s+as\b|\byou\s+are\s+an?\b|\byou're\s+an?\b|\baudience\b|\breaders?\b|\baimed\s+at\b|\btargeted?\s+(?:at|to)\b|\bwho\s+(?:is|are)\s+this\s+for\b/i;

  /* ------------------------------------------------------------------ *
   * Precompiled phrase regexes
   * ------------------------------------------------------------------ */
  const GENERIC_RE = T.phraseRegex(GENERIC_VERBS);
  const GENERATIVE_RE = T.phraseRegex(GENERATIVE_VERBS);
  const FORMAT_RE = T.phraseRegex(FORMAT_SIGNALS);
  const TASK_RE = T.phraseRegex(TASK_VERBS);
  const CONTEXT_RE = T.phraseRegex(CONTEXT_MARKERS);
  const FILLER_RE = T.phraseRegex(FILLER_PHRASES);
  const OPEN_RE = T.phraseRegex(OPEN_ENDED);

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  function firstMatch(re, lower) {
    re.lastIndex = 0;
    return re.exec(lower);
  }

  /** Words of a clause span, from the shared word list (no re-tokenizing). */
  function clauseWords(a, span) {
    const out = [];
    for (const w of a.words) {
      if (w.start >= span.start && w.end <= span.end) out.push(w);
      else if (w.start >= span.end) break;
    }
    return out;
  }

  /** Does this clause start with an imperative verb (after lead-in words)? */
  function isImperativeClause(a, span) {
    const ws = clauseWords(a, span);
    for (let i = 0; i < ws.length && i < 4; i++) {
      const lw = ws[i].lower;
      if (CLAUSE_LEADIN.has(lw)) continue;
      return IMPERATIVE_VERBS.has(lw);
    }
    return false;
  }

  /** Strip filler phrases from a fragment (used by restructure). */
  function stripFiller(text) {
    const re = new RegExp(FILLER_RE.source, 'gi');
    return text.replace(re, '').replace(/\s{2,}/g, ' ').trim();
  }

  /* ------------------------------------------------------------------ *
   * RULES
   * ------------------------------------------------------------------ */

  const RULES = [
    {
      id: 'vague-ask',
      ruleName: 'Vague ask',
      category: 'clarity',
      severity: 'high',
      check(a) {
        if (a.wordCount === 0 || a.wordCount > 8) return [];
        if (!firstMatch(GENERIC_RE, a.lower)) return [];
        // "No object detail": every word is non-substantive (DECISIONS #4).
        const substantive = a.words.filter((w) => !NON_SUBSTANTIVE.has(w.lower));
        if (substantive.length > 0) return [];
        return [{
          start: a.trimmed.start,
          end: a.trimmed.end,
          message: 'This ask is too vague — the model has to guess what "better" means to you.',
          fix: 'Name the object and the goal: what exactly should be improved, and what does success look like?',
        }];
      },
    },

    {
      id: 'no-output-format',
      ruleName: 'No output format',
      category: 'format',
      severity: 'med',
      check(a) {
        const gen = firstMatch(GENERATIVE_RE, a.lower);
        if (!gen) return [];
        if (firstMatch(FORMAT_RE, a.lower)) return [];
        if (COUNT_UNIT_RE.test(a.text)) return [];
        return [{
          start: gen.index,
          end: gen.index + gen[0].length,
          message: 'You ask for output but never say what shape it should take.',
          fix: 'Append a format line, e.g. "Format: 5 bullet points, under 100 words, confident tone."',
        }];
      },
    },

    {
      id: 'no-context',
      ruleName: 'No context given',
      category: 'context',
      severity: 'med',
      check(a) {
        if (a.wordCount === 0 || a.wordCount >= 25) return [];
        if (!firstMatch(TASK_RE, a.lower)) return [];
        if (firstMatch(CONTEXT_RE, a.lower) || CONTEXT_COLON_RE.test(a.text)) return [];
        const s = a.sentences[0] || a.trimmed;
        return [{
          start: s.start,
          end: s.end,
          message: 'Short task with zero context — the model knows nothing about your situation.',
          fix: 'Add one line of background: who this is for, what it relates to, or paste the material.',
        }];
      },
    },

    {
      id: 'dangling-reference',
      ruleName: 'Dangling reference',
      category: 'clarity',
      severity: 'high',
      check(a) {
        if (a.sentences.length > 1) return []; // extra content exists beyond the sentence
        if (a.wordCount === 0 || a.wordCount > 10) return []; // DECISIONS #5
        const lead = a.words.slice(0, 4);
        const hit = lead.find((w) => DEMONSTRATIVES.has(w.lower));
        if (!hit) return [];
        return [{
          start: a.trimmed.start,
          end: a.trimmed.end,
          message: `References "${hit.text}" but there is no content in the message for it to point to.`,
          fix: 'Paste the text/code you mean, or name it explicitly ("fix the SQL query below…").',
        }];
      },
    },

    {
      id: 'multi-ask',
      ruleName: 'Multi-ask overload',
      category: 'structure',
      severity: 'med',
      check(a) {
        let count = 0;
        for (const c of a.clauses) if (isImperativeClause(a, c)) count++;
        if (count < 4) return [];
        return [{
          start: a.trimmed.start,
          end: a.trimmed.end,
          message: `${count} separate asks crammed into one prompt — quality drops on the later ones.`,
          fix: `Number the asks 1–${count} (the Restructure button does this for you), or send them one at a time.`,
        }];
      },
    },

    {
      id: 'filler',
      ruleName: 'Token-waste filler',
      category: 'style',
      severity: 'low',
      check(a) {
        const issues = [];
        const re = new RegExp(FILLER_RE.source, 'gi');
        let m;
        while ((m = re.exec(a.lower)) !== null) {
          issues.push({
            start: m.index,
            end: m.index + m[0].length,
            message: `"${a.text.slice(m.index, m.index + m[0].length)}" is politeness padding — models don't need it.`,
            fix: 'Delete this phrase; it costs tokens and adds no signal.',
          });
        }
        return issues;
      },
    },

    {
      id: 'no-success-criteria',
      ruleName: 'No success criteria',
      category: 'format',
      severity: 'low',
      check(a) {
        const open = firstMatch(OPEN_RE, a.lower);
        if (!open) return [];
        if (CRITERIA_RE.test(a.text)) return [];
        return [{
          start: open.index,
          end: open.index + open[0].length,
          message: 'Open-ended ask with no quantity or ranking criteria — you\'ll get a generic list.',
          fix: 'Bound it: "top 5, ranked by cost", "best for beginners", "under $100".',
        }];
      },
    },

    {
      id: 'contradiction',
      ruleName: 'Contradiction',
      category: 'structure',
      severity: 'med',
      check(a) {
        const bre = new RegExp(BREVITY_RE.source, 'gi');
        const dep = new RegExp(DEPTH_RE.source, 'gi');
        const b = bre.exec(a.lower);
        if (!b) return [];
        const d = dep.exec(a.lower);
        if (!d) return [];
        const later = d.index > b.index ? d : b;
        const bWord = a.text.slice(b.index, b.index + b[0].length);
        const dWord = a.text.slice(d.index, d.index + d[0].length);
        return [{
          start: later.index,
          end: later.index + later[0].length,
          message: `"${bWord}" and "${dWord}" pull in opposite directions — the model will pick one at random.`,
          fix: 'Pick one, or scope each: "a brief summary first, then a detailed appendix".',
        }];
      },
    },

    {
      id: 'missing-audience',
      ruleName: 'Missing audience/role',
      category: 'context',
      severity: 'low',
      check(a) {
        const re = new RegExp(CONTENT_VERB_RE.source, 'gi');
        const m = re.exec(a.lower);
        if (!m) return [];
        if (AUDIENCE_RE.test(a.lower)) return [];
        return [{
          start: m.index,
          end: m.index + m[0].length,
          message: 'Content ask with no audience or role — tone and depth will be generic.',
          fix: 'Add "for [audience]" or "act as [role]", e.g. "for first-time founders" / "as a copywriter".',
        }];
      },
    },
  ];

  /* ------------------------------------------------------------------ *
   * Runner + scoring
   * ------------------------------------------------------------------ */

  const CATEGORIES = {
    clarity: 'Clarity',
    context: 'Context',
    format: 'Format',
    structure: 'Structure',
    style: 'Style',
  };

  const DEDUCTION = { high: 20, med: 10, low: 4 };

  /**
   * Run all rules whose category is enabled.
   * @param {object} analysis  from PromptLint.tokenizer.analyze
   * @param {object} enabledCategories  e.g. {clarity:true, ...}
   */
  function run(analysis, enabledCategories) {
    const issues = [];
    if (!analysis.trimmed.text) return issues;
    for (const rule of RULES) {
      if (enabledCategories && enabledCategories[rule.category] === false) continue;
      try {
        for (const found of rule.check(analysis)) {
          issues.push({
            id: rule.id,
            ruleName: rule.ruleName,
            category: rule.category,
            severity: rule.severity,
            start: found.start,
            end: found.end,
            message: found.message,
            fix: found.fix,
          });
        }
      } catch (e) {
        console.debug('PromptLint: rule failed', rule.id, e);
      }
    }
    // Highest severity first, then by position — the order the panel shows.
    const sevRank = { high: 0, med: 1, low: 2 };
    issues.sort((x, y) => sevRank[x.severity] - sevRank[y.severity] || x.start - y.start);
    return issues;
  }

  /** Start 100; −20 High, −10 Med, −4 Low; floor 0. */
  function score(issues) {
    let s = 100;
    for (const i of issues) s -= DEDUCTION[i.severity] || 0;
    s = Math.max(0, s);
    return { score: s, grade: s >= 80 ? 'Strong' : s >= 60 ? 'OK' : 'Weak' };
  }

  PL.rules = {
    run,
    score,
    CATEGORIES,
    RULES,
    // shared lexicon helpers for restructure.js
    lex: {
      isImperativeClause,
      stripFiller,
      FORMAT_RE,
      COUNT_UNIT_RE,
      CONTEXT_RE,
      CONTEXT_COLON_RE,
      clauseWords,
    },
  };
})();
