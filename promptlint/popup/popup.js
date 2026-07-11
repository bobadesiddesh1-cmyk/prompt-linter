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
  };

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
