# PromptLint — Privacy Policy

*Effective date: July 11, 2026*

PromptLint is a browser extension that checks the quality of AI prompts as you type on chatgpt.com, claude.ai, gemini.google.com, and perplexity.ai.

## The short version

**PromptLint collects nothing, transmits nothing, and has no servers.** All analysis happens locally in your browser using a built-in rule engine. The extension makes zero network requests of any kind.

## What the extension processes

- **Prompt text you type** into the composer of a supported AI chat site is analyzed **locally, in memory, on your device** to compute lint issues and a strength score. This text is never stored permanently and never leaves the page.

## What the extension stores

- **Settings** (on/off toggles per site and per rule category) — stored via `chrome.storage.sync`, which syncs only through your own browser profile.
- **Your last 10 prompt scores** (score number, site name, the first 40 characters of the prompt, timestamp) — stored via `chrome.storage.local` on your device only, viewable in the extension popup, overwritten as new entries arrive.

You can clear both at any time by removing the extension.

## What the extension does NOT do

- No network requests — no data is sent to us or anyone else (there is no "us" backend at all).
- No analytics, telemetry, crash reporting, or tracking of any kind.
- No account, sign-in, or personal information.
- No reading of pages other than the four supported AI chat sites listed in the manifest.
- No selling or sharing of data — there is no data to sell or share.

## Permissions explained

- **`storage`** — to save your toggle settings and the local score history described above.
- **Content-script access to chatgpt.com, claude.ai, gemini.google.com, perplexity.ai** — required to read the prompt composer on those specific sites and draw the underlines/score badge. The extension runs on no other sites.

## Changes & contact

Any change to this policy will be published in this repository. Questions: open an issue at https://github.com/bobadesiddesh1-cmyk/prompt-linter/issues
