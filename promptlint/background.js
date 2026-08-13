/**
 * PromptLint — background.js (MV3 service worker)
 *
 * Sole job: relay keyboard-shortcut commands to the content script.
 *
 * Why a port instead of chrome.tabs.sendMessage: sendMessage to a tab requires
 * host permissions for that tab, which this extension deliberately does not
 * request. Content scripts connect *outbound* to the worker instead, which
 * needs no extra permission at all. The worker broadcasts each command to
 * every connected port, and each content script ignores it unless its own
 * document has focus — so only the tab the user is looking at reacts.
 *
 * This file never touches page content and makes no network requests.
 */
'use strict';

const ports = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'promptlint') return;
  ports.add(port);
  port.onDisconnect.addListener(() => {
    ports.delete(port);
    void chrome.runtime.lastError; // disconnects are expected on navigation
  });
});

chrome.commands.onCommand.addListener((command) => {
  for (const port of [...ports]) {
    try {
      port.postMessage({ command });
    } catch (e) {
      ports.delete(port); // port died between navigation and delivery
    }
  }
});
