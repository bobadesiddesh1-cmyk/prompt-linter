/**
 * PromptLint — shared/library.js
 *
 * Prompt library: 20 built-in starter templates plus the user's own saved
 * snippets. Snippets live in chrome.storage.local (not sync) because prompt
 * text can be long and sync caps items at 8 KB / 100 KB total.
 *
 * Templates are plain strings with [ADD: …] markers in the same style as the
 * restructure engine, so the two features feel like one idea.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.library) return;

  const SNIPPET_KEY = 'promptlint_snippets';
  const SNIPPET_MAX = 100;

  /** Built-in starters — grouped by what the user is trying to do. */
  const BUILTIN = [
    { id: 'b-role', cat: 'Foundations', title: 'Expert role',
      text: 'Act as a [ADD: role, e.g. senior product marketer] with 10+ years of experience.\n\nTask: [ADD: what you want done]\nContext: [ADD: your situation]\nOutput format: [ADD: e.g. 5 bullet points, under 150 words]' },
    { id: 'b-skeleton', cat: 'Foundations', title: 'Full prompt skeleton',
      text: 'Role/Context: [ADD: who you are and the background]\nTask: [ADD: the one specific thing you want]\nDetails: [ADD: constraints, examples, must-haves]\nOutput format: [ADD: shape, length, tone]' },
    { id: 'b-stepback', cat: 'Foundations', title: 'Ask before answering',
      text: 'Before you answer, ask me up to 5 clarifying questions that would materially change your response. Wait for my answers.\n\nMy request: [ADD: your request]' },
    { id: 'b-eli5', cat: 'Learning', title: 'Explain simply',
      text: 'Explain [ADD: topic] to someone with no background in it.\n\nUse a everyday analogy, then a 5-step breakdown, then one common misconception. Under 250 words, plain language, no jargon.' },
    { id: 'b-teach', cat: 'Learning', title: 'Teach me a skill',
      text: 'I want to learn [ADD: skill]. I currently know [ADD: your level].\n\nBuild a 4-week plan: weekly goals, one concrete exercise per week, and how I test myself at the end. Format as a table.' },
    { id: 'b-compare', cat: 'Learning', title: 'Compare options',
      text: 'Compare [ADD: option A] and [ADD: option B] for [ADD: your use case].\n\nFormat: a table with criteria as rows, then a one-paragraph recommendation naming which to pick and why. Rank by [ADD: what matters most to you].' },
    { id: 'b-blog', cat: 'Writing', title: 'Blog post',
      text: 'Act as a writer for [ADD: audience].\n\nWrite a blog post about [ADD: topic]. Angle: [ADD: the specific take].\n\nOutput format: 800 words, H2 subheads, conversational but not cutesy, one concrete example per section, no filler intro.' },
    { id: 'b-email', cat: 'Writing', title: 'Professional email',
      text: 'Write an email to [ADD: recipient and their role] about [ADD: subject].\n\nGoal: [ADD: what you want them to do]\nTone: [ADD: warm / direct / formal]\nOutput format: under 120 words, clear subject line, one explicit ask.' },
    { id: 'b-rewrite', cat: 'Writing', title: 'Rewrite / tighten',
      text: 'Rewrite the text below to be [ADD: clearer / shorter / more formal] for [ADD: audience].\n\nKeep the meaning and any specifics. Cut filler. Return only the rewrite, then a 3-bullet list of what you changed and why.\n\nText:\n[ADD: paste your text]' },
    { id: 'b-social', cat: 'Writing', title: 'Social post set',
      text: 'Write 5 [ADD: LinkedIn / X] posts about [ADD: topic] for [ADD: audience].\n\nEach: a hook line, 3 short body lines, one takeaway. Vary the angle across the 5. No hashtags, no emoji. Under 80 words each.' },
    { id: 'b-summary', cat: 'Analysis', title: 'Summarize with structure',
      text: 'Summarize the text below.\n\nOutput format: (1) one-sentence TL;DR, (2) 5 key points as bullets, (3) anything the author left unsupported. Under 200 words total.\n\nText:\n[ADD: paste your text]' },
    { id: 'b-critique', cat: 'Analysis', title: 'Critique my work',
      text: 'Act as a tough but fair reviewer for [ADD: audience/context].\n\nCritique the work below. Give: 3 things that genuinely work, 3 concrete weaknesses with the specific line or part at fault, and the single highest-impact fix. Be direct; skip compliments that are not earned.\n\nWork:\n[ADD: paste your work]' },
    { id: 'b-devil', cat: 'Analysis', title: 'Argue against it',
      text: 'I am planning to [ADD: your plan].\n\nMake the strongest case against it. Give the top 5 failure modes ranked by likelihood, what would have to be true for each, and the earliest signal I would see. Do not hedge or balance it with pros.' },
    { id: 'b-data', cat: 'Analysis', title: 'Read this data',
      text: 'Analyze the data below for [ADD: the decision you are making].\n\nOutput format: 3 findings with the numbers that support each, 1 thing the data cannot tell me, and a recommended next step. No speculation beyond the data.\n\nData:\n[ADD: paste your data]' },
    { id: 'b-debug', cat: 'Technical', title: 'Debug an error',
      text: 'I am getting this error in [ADD: language/framework and version]:\n\n[ADD: paste the full error]\n\nRelevant code:\n[ADD: paste the code]\n\nWhat I already tried: [ADD: your attempts]\n\nGive the most likely cause first with the reasoning, then the fix as a diff. If you need more info to be sure, say exactly what.' },
    { id: 'b-review', cat: 'Technical', title: 'Code review',
      text: 'Review the code below for [ADD: correctness / performance / security].\n\nFor each issue: the line, why it breaks, and the corrected code. Order by severity. Skip style nits unless they cause bugs.\n\nCode:\n[ADD: paste your code]' },
    { id: 'b-explaincode', cat: 'Technical', title: 'Explain this code',
      text: 'Explain what the code below does, for a developer who knows [ADD: their level].\n\nFormat: one-line purpose, then a walk-through of the non-obvious parts only, then any bug or edge case you notice.\n\nCode:\n[ADD: paste your code]' },
    { id: 'b-ideas', cat: 'Ideation', title: 'Bounded brainstorm',
      text: 'Give me 10 ideas for [ADD: your goal], for [ADD: audience], within [ADD: constraint — budget/time/skills].\n\nRank by [ADD: impact / ease]. For each: one line on the idea and one line on the first step. No generic advice.' },
    { id: 'b-names', cat: 'Ideation', title: 'Naming',
      text: 'Suggest 15 names for [ADD: what it is] aimed at [ADD: audience].\n\nStyle: [ADD: plain / playful / technical]. For each, one line on why it fits. Avoid names that are hard to spell or already common in [ADD: your industry].' },
    { id: 'b-decide', cat: 'Ideation', title: 'Help me decide',
      text: 'Help me decide: [ADD: the decision].\n\nMy options: [ADD: list them]\nWhat matters most: [ADD: your criteria]\nConstraints: [ADD: budget, timeline, anything fixed]\n\nGive a scored comparison table, then commit to one recommendation and name the biggest risk of that choice.' },
  ];

  function hasChrome() {
    try { return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local; }
    catch (e) { return false; }
  }

  function getSnippets() {
    return new Promise((resolve) => {
      if (!hasChrome()) return resolve([]);
      try {
        chrome.storage.local.get(SNIPPET_KEY, (res) => {
          if (chrome.runtime.lastError) return resolve([]);
          resolve(Array.isArray(res && res[SNIPPET_KEY]) ? res[SNIPPET_KEY] : []);
        });
      } catch (e) { resolve([]); }
    });
  }

  function writeSnippets(list) {
    return new Promise((resolve) => {
      if (!hasChrome()) return resolve(list);
      try {
        chrome.storage.local.set({ [SNIPPET_KEY]: list.slice(0, SNIPPET_MAX) }, () => {
          void chrome.runtime.lastError;
          resolve(list);
        });
      } catch (e) { resolve(list); }
    });
  }

  /** Save a snippet; title defaults to the first 40 chars. Newest first. */
  async function saveSnippet(text, title) {
    const clean = String(text || '').trim();
    if (!clean) return null;
    const list = await getSnippets();
    const entry = {
      id: 's' + Date.now().toString(36) + Math.floor(performance.now() % 1000).toString(36),
      title: (title || clean.slice(0, 40).replace(/\s+/g, ' ')).trim(),
      text: clean,
      ts: Date.now(),
    };
    list.unshift(entry);
    await writeSnippets(list);
    return entry;
  }

  async function deleteSnippet(id) {
    const list = await getSnippets();
    await writeSnippets(list.filter((s) => s.id !== id));
  }

  PL.library = { BUILTIN, getSnippets, saveSnippet, deleteSnippet, SNIPPET_KEY };
})();
