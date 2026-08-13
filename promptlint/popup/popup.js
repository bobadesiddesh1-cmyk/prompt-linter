/**
 * PromptLint — popup/popup.js
 * Global toggle, per-site toggles, per-rule-category toggles (storage.sync)
 * and the last 10 prompt scores (storage.local). Pure vanilla JS.
 */
(() => {
  'use strict';
  const S = window.PromptLint.storageApi;

  const SITE_LABELS = {
    'chatgpt.com': 'ChatGPT',
    'claude.ai': 'Claude',
    'gemini.google.com': 'Gemini',
    'perplexity.ai': 'Perplexity',
  };
  const CATEGORY_LABELS = {
    clarity: 'Clarity (vague ask, dangling reference)',
    context: 'Context (background, audience/role)',
    format: 'Format (output shape, success criteria)',
    structure: 'Structure (multi-ask, contradictions)',
    style: 'Style (token-waste filler)',
    custom: 'Custom (your own rules, below)',
  };

  const LIB = window.PromptLint.library;
  const STATS = window.PromptLint.stats;

  /** "a, b , c" → ['a','b','c'] (empties dropped, duplicates kept simple). */
  function parseList(value) {
    return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
  }

  let saveTimer = 0;
  function debouncedSaveCustom() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await S.updateSettings({
        customRules: {
          banned: parseList($('banned').value),
          required: parseList($('required').value),
        },
      });
      const note = $('custom-saved');
      note.textContent = 'Saved ✓';
      setTimeout(() => (note.textContent = ''), 1400);
    }, 500);
  }

  function statTile(value, label) {
    const d = document.createElement('div');
    d.className = 'stat';
    const v = document.createElement('div');
    v.className = 'v';
    v.textContent = value;
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = label;
    d.append(v, k);
    return d;
  }

  async function renderStats() {
    const raw = await STATS.get();
    const s = STATS.summarize(raw);
    const box = $('stats');
    box.textContent = '';
    box.append(
      statTile(s.total, 'Prompts'),
      statTile(s.total ? s.avg : '–', 'Avg score'),
      statTile(s.total ? s.best : '–', 'Best'),
      statTile(s.streak ? s.streak + 'd' : '–', 'Streak')
    );
    const trend = document.createElement('p');
    trend.className = 'trend';
    if (s.delta === null || s.recentAvg === null) {
      trend.textContent = s.total
        ? 'Keep going — a week of prompts unlocks your trend.'
        : 'Lint a few prompts to start tracking.';
    } else {
      const up = s.delta >= 0;
      trend.innerHTML = '';
      trend.append(document.createTextNode('This week '));
      const b = document.createElement('b');
      b.className = up ? 'up' : 'down';
      b.textContent = (up ? '▲ +' : '▼ ') + s.delta;
      trend.append(b, document.createTextNode(` vs last week (${s.recentAvg} vs ${s.priorAvg})`));
    }
    box.after(trend);
  }

  async function renderSnippets() {
    const list = await LIB.getSnippets();
    const ul = $('snippets');
    const empty = $('snippets-empty');
    ul.textContent = '';
    empty.style.display = list.length ? 'none' : 'block';
    for (const sn of list) {
      const li = document.createElement('li');
      const main = document.createElement('div');
      main.className = 'hist-main';
      const t = document.createElement('div');
      t.className = 'hist-snippet';
      t.textContent = sn.title;
      const meta = document.createElement('div');
      meta.className = 'hist-meta';
      meta.textContent = timeAgo(sn.ts);
      main.append(t, meta);
      const del = document.createElement('button');
      del.className = 'del-btn';
      del.textContent = '🗑';
      del.title = 'Delete';
      del.addEventListener('click', async () => { await LIB.deleteSnippet(sn.id); renderSnippets(); });
      li.append(main, del);
      ul.appendChild(li);
    }
  }

  const $ = (id) => document.getElementById(id);

  function scoreColor(score) {
    if (score >= 80) return 'var(--green)';
    if (score >= 60) return 'var(--amber)';
    return 'var(--red)';
  }

  function makeSwitch(checked, disabled, onChange) {
    const label = document.createElement('label');
    label.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = disabled;
    input.addEventListener('change', () => onChange(input.checked));
    const slider = document.createElement('span');
    slider.className = 'slider';
    label.append(input, slider);
    return label;
  }

  function row(text, switchEl) {
    const div = document.createElement('div');
    div.className = 'toggle-row';
    const span = document.createElement('span');
    span.textContent = text;
    div.append(span, switchEl);
    return div;
  }

  function timeAgo(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  async function render() {
    const settings = await S.getSettings();

    // Global kill switch
    const global = $('global-toggle');
    global.checked = settings.enabled;
    global.onchange = async () => {
      await S.updateSettings({ enabled: global.checked });
      render();
    };

    // Per-site toggles
    const sites = $('site-toggles');
    sites.textContent = '';
    for (const site of S.SITES) {
      sites.appendChild(
        row(
          SITE_LABELS[site] || site,
          makeSwitch(settings.sites[site] !== false, !settings.enabled, (on) =>
            S.updateSettings({ sites: { [site]: on } })
          )
        )
      );
    }

    // Per-category toggles
    const cats = $('category-toggles');
    cats.textContent = '';
    for (const key of Object.keys(CATEGORY_LABELS)) {
      cats.appendChild(
        row(
          CATEGORY_LABELS[key],
          makeSwitch(settings.categories[key] !== false, !settings.enabled, (on) =>
            S.updateSettings({ categories: { [key]: on } })
          )
        )
      );
    }

    // Custom rules
    $('banned').value = (settings.customRules.banned || []).join(', ');
    $('required').value = (settings.customRules.required || []).join(', ');
    $('banned').oninput = debouncedSaveCustom;
    $('required').oninput = debouncedSaveCustom;

    await renderStats();
    await renderSnippets();

    // History
    const list = $('history');
    const empty = $('history-empty');
    const history = await S.getHistory();
    list.textContent = '';
    empty.style.display = history.length ? 'none' : 'block';
    for (const h of history) {
      const li = document.createElement('li');
      const pill = document.createElement('span');
      pill.className = 'score-pill';
      pill.style.background = scoreColor(h.score);
      pill.textContent = h.score;
      const main = document.createElement('div');
      main.className = 'hist-main';
      const snip = document.createElement('div');
      snip.className = 'hist-snippet';
      snip.textContent = h.snippet || '(empty)';
      const meta = document.createElement('div');
      meta.className = 'hist-meta';
      meta.textContent = (SITE_LABELS[h.site] || h.site) + ' · ' + timeAgo(h.ts);
      main.append(snip, meta);
      li.append(pill, main);
      list.appendChild(li);
    }
  }

  render();
})();
