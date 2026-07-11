/**
 * PromptLint — shared/storage.js
 *
 * Settings live in chrome.storage.sync (roam with the browser profile);
 * score history lives in chrome.storage.local (device-only, capped at 10).
 * Used by both the content scripts and the popup. Zero network calls.
 */
(() => {
  'use strict';
  const PL = (window.PromptLint = window.PromptLint || {});
  if (PL.storageApi) return;

  const SITES = ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai'];

  const DEFAULT_SETTINGS = {
    enabled: true, // global kill switch
    sites: {
      'chatgpt.com': true,
      'claude.ai': true,
      'gemini.google.com': true,
      'perplexity.ai': true,
    },
    categories: {
      clarity: true,
      context: true,
      format: true,
      structure: true,
      style: true,
    },
  };

  const HISTORY_KEY = 'promptlint_history';
  const SETTINGS_KEY = 'promptlint_settings';
  const HISTORY_MAX = 10;

  function hasChrome() {
    try {
      return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.sync;
    } catch (e) {
      return false;
    }
  }

  /** Deep-merge stored settings over defaults so new keys get sane values. */
  function mergeSettings(stored) {
    const s = stored && typeof stored === 'object' ? stored : {};
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.enabled,
      sites: Object.assign({}, DEFAULT_SETTINGS.sites, s.sites || {}),
      categories: Object.assign({}, DEFAULT_SETTINGS.categories, s.categories || {}),
    };
  }

  function getSettings() {
    return new Promise((resolve) => {
      if (!hasChrome()) return resolve(mergeSettings(null));
      try {
        chrome.storage.sync.get(SETTINGS_KEY, (res) => {
          if (chrome.runtime.lastError) return resolve(mergeSettings(null));
          resolve(mergeSettings(res && res[SETTINGS_KEY]));
        });
      } catch (e) {
        resolve(mergeSettings(null));
      }
    });
  }

  /** Shallow patch: {enabled} | {sites:{...}} | {categories:{...}} — merged over current. */
  async function updateSettings(patch) {
    const cur = await getSettings();
    const next = {
      enabled: patch.enabled !== undefined ? patch.enabled : cur.enabled,
      sites: Object.assign({}, cur.sites, patch.sites || {}),
      categories: Object.assign({}, cur.categories, patch.categories || {}),
    };
    return new Promise((resolve) => {
      if (!hasChrome()) return resolve(next);
      try {
        chrome.storage.sync.set({ [SETTINGS_KEY]: next }, () => {
          void chrome.runtime.lastError; // swallow; settings still returned
          resolve(next);
        });
      } catch (e) {
        resolve(next);
      }
    });
  }

  /** Subscribe to settings changes (fires with the merged settings object). */
  function onSettingsChanged(cb) {
    if (!hasChrome() || !chrome.storage.onChanged) return () => {};
    const listener = (changes, area) => {
      if (area === 'sync' && changes[SETTINGS_KEY]) {
        try {
          cb(mergeSettings(changes[SETTINGS_KEY].newValue));
        } catch (e) {
          console.debug('PromptLint: settings listener error', e);
        }
      }
    };
    try {
      chrome.storage.onChanged.addListener(listener);
    } catch (e) {
      return () => {};
    }
    return () => {
      try { chrome.storage.onChanged.removeListener(listener); } catch (e) { /* no-op */ }
    };
  }

  /** entry = {score, grade, site, snippet, ts} — newest first, capped at 10. */
  function pushHistory(entry) {
    return new Promise((resolve) => {
      if (!hasChrome() || !chrome.storage.local) return resolve();
      try {
        chrome.storage.local.get(HISTORY_KEY, (res) => {
          if (chrome.runtime.lastError) return resolve();
          const list = Array.isArray(res && res[HISTORY_KEY]) ? res[HISTORY_KEY] : [];
          list.unshift(entry);
          chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, HISTORY_MAX) }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function getHistory() {
    return new Promise((resolve) => {
      if (!hasChrome() || !chrome.storage.local) return resolve([]);
      try {
        chrome.storage.local.get(HISTORY_KEY, (res) => {
          if (chrome.runtime.lastError) return resolve([]);
          resolve(Array.isArray(res && res[HISTORY_KEY]) ? res[HISTORY_KEY] : []);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }

  PL.storageApi = {
    SITES,
    DEFAULT_SETTINGS,
    getSettings,
    updateSettings,
    onSettingsChanged,
    pushHistory,
    getHistory,
  };
})();
