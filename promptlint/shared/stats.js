/**
 * PromptLint — shared/stats.js
 *
 * Local-only usage stats: totals, rolling average, best score, and a
 * day streak. Everything is derived from prompts the user already linted;
 * nothing extra is recorded and nothing leaves the device.
 *
 * Shape (chrome.storage.local key `promptlint_stats`):
 *   { total, sum, best, streak, lastDay, days: { 'YYYY-MM-DD': {n, sum} } }
 * `days` is trimmed to the most recent 30 entries.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.stats) return;

  const KEY = 'promptlint_stats';
  const DAYS_KEPT = 30;

  const EMPTY = { total: 0, sum: 0, best: 0, streak: 0, lastDay: '', days: {} };

  function hasChrome() {
    try { return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local; }
    catch (e) { return false; }
  }

  /** Local calendar day key, e.g. '2026-08-13'. */
  function dayKey(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function daysBetween(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
    return Math.round(ms / 86400000);
  }

  function get() {
    return new Promise((resolve) => {
      if (!hasChrome()) return resolve(Object.assign({}, EMPTY));
      try {
        chrome.storage.local.get(KEY, (res) => {
          if (chrome.runtime.lastError) return resolve(Object.assign({}, EMPTY));
          const s = (res && res[KEY]) || {};
          resolve(Object.assign({}, EMPTY, s, { days: Object.assign({}, s.days || {}) }));
        });
      } catch (e) { resolve(Object.assign({}, EMPTY)); }
    });
  }

  /** Fold one scored prompt into the stats. Called when a prompt is sent. */
  async function record(score, ts) {
    const now = ts || Date.now();
    const key = dayKey(now);
    const s = await get();

    s.total += 1;
    s.sum += score;
    if (score > s.best) s.best = score;

    // Streak: consecutive calendar days with at least one prompt.
    if (!s.lastDay) s.streak = 1;
    else {
      const gap = daysBetween(s.lastDay, key);
      if (gap === 0) s.streak = Math.max(1, s.streak);
      else if (gap === 1) s.streak += 1;
      else if (gap > 1) s.streak = 1;
    }
    s.lastDay = key;

    const d = s.days[key] || { n: 0, sum: 0 };
    d.n += 1;
    d.sum += score;
    s.days[key] = d;

    // Keep the map bounded.
    const keys = Object.keys(s.days).sort();
    while (keys.length > DAYS_KEPT) delete s.days[keys.shift()];

    return new Promise((resolve) => {
      if (!hasChrome()) return resolve(s);
      try {
        chrome.storage.local.set({ [KEY]: s }, () => { void chrome.runtime.lastError; resolve(s); });
      } catch (e) { resolve(s); }
    });
  }

  /** Derived numbers for the popup. */
  function summarize(s) {
    const avg = s.total ? Math.round(s.sum / s.total) : 0;
    const today = dayKey(Date.now());

    // Rolling 7-day windows: this week vs the 7 days before it.
    let recentSum = 0, recentN = 0, priorSum = 0, priorN = 0;
    for (const k of Object.keys(s.days)) {
      const age = daysBetween(k, today);
      const d = s.days[k];
      if (age >= 0 && age < 7) { recentSum += d.sum; recentN += d.n; }
      else if (age >= 7 && age < 14) { priorSum += d.sum; priorN += d.n; }
    }
    const recentAvg = recentN ? Math.round(recentSum / recentN) : null;
    const priorAvg = priorN ? Math.round(priorSum / priorN) : null;

    // A streak only counts if the last recorded day is today or yesterday.
    let streak = s.streak;
    if (s.lastDay) {
      const gap = daysBetween(s.lastDay, today);
      if (gap > 1) streak = 0;
    } else {
      streak = 0;
    }

    return {
      total: s.total,
      avg,
      best: s.best,
      streak,
      recentAvg,
      priorAvg,
      delta: recentAvg !== null && priorAvg !== null ? recentAvg - priorAvg : null,
    };
  }

  PL.stats = { get, record, summarize, dayKey, daysBetween, KEY };
})();
