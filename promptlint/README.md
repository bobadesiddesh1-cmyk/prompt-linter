# PromptLint — AI Prompt Linter

*✦ Sharper prompts, better answers.*

Underlines weak prompts as you type inside **ChatGPT, Claude, Gemini, and Perplexity** — vague asks, missing format, dangling references, multi-ask overload — with a live **Prompt Strength score** and a one-click **Restructure** that rebuilds your prompt from your own words.

**100% local. Zero network calls. No analytics. No account.** The only permission it asks for is `storage` (to remember your toggles and last 10 scores).

---

## Install (load unpacked)

1. Download/clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `promptlint/` folder (the one containing `manifest.json`).
5. Open [chatgpt.com](https://chatgpt.com), [claude.ai](https://claude.ai), [gemini.google.com](https://gemini.google.com), or [perplexity.ai](https://www.perplexity.ai) and start typing. A score badge appears at the composer's bottom-right corner; click it for details.

No build step. No dependencies. The folder loads as-is.

## How it works

- Content scripts detect the site's composer (see **Adapter-repair guide** below), then lint your draft on a 700 ms typing debounce.
- Weak spots get **dotted underlines** — red = High, orange = Med, yellow = Low — via the CSS Custom Highlight API (contenteditable) or a mirror overlay (textarea).
- The **badge** shows a live Prompt Strength score: start at 100, −20 per High, −10 per Med, −4 per Low, floor 0. **Strong ≥ 80 · OK ≥ 60 · Weak < 60.**
- Click the badge → **panel** with the issue list (click an issue to pulse its underline), rule-category toggles, and **Restructure prompt** — a deterministic, no-LLM rewrite that reorganizes *your own words* into `Role/Context / Task / Details / Output format`, inserting `[ADD: …]` for missing slots. **Copy** or **Insert into composer** (native undo preserved — Ctrl+Z restores your original). It never auto-sends.
- Hover any underline → mini-card with the rule message and fix suggestion.
- The extension **never touches keyboard handling** — no keydown listeners on the composer exist anywhere in the codebase. Enter sends your message exactly as before.

## Rule inventory

| # | Rule | Severity | Fires when | Suggested fix |
|---|------|----------|-----------|----------------|
| 1 | **Vague ask** | High | ≤ 8 words, a generic verb (*improve, fix, help, make better, optimize, look at…*), and no substantive object detail | Name the object and the goal |
| 2 | **No output format** | Med | Generative verb (*write, create, generate, draft, build, summarize, list…*) with zero format signals (*table, bullets, JSON, markdown, steps, tone, format, N words…*) | Append a format line |
| 3 | **No context given** | Med | Task verb, < 25 words, no context markers (*for, about, based on, given, my, our, context:…*) | Add one line of background |
| 4 | **Dangling reference** | High | Starts with *this/that/it/these/those* ("fix this") as a single short sentence with no pasted content | Paste or name the thing you mean |
| 5 | **Multi-ask overload** | Med | 4+ imperative clauses (split on *and/also/then/plus*, `;`, sentence boundaries) | Number the asks 1..N (Restructure does it) |
| 6 | **Token-waste filler** | Low | *please kindly, if you don't mind, I was wondering if you could, sorry to bother you, would it be possible for you to…* | Delete the phrase |
| 7 | **No success criteria** | Low | Open-ended ask (*ideas, suggestions, options, recommend…*) without quantity/criteria (*top 5, ranked by, best for X, under ₹/$…*) | Bound it |
| 8 | **Contradiction** | Med | Both brevity (*brief, short, concise, quick*) and depth (*detailed, comprehensive, in-depth, thorough*) words | Pick one, or scope each |
| 9 | **Missing audience/role** | Low | Content-creation verb without *for [audience]* or *as a / act as [role]* | Add the audience or role |

**Categories** (toggleable in panel & popup): Clarity (1, 4) · Context (3, 9) · Format (2, 7) · Structure (5, 8) · Style (6). Disabled categories are excluded from underlines, the panel, *and* the score.

All matching is case-insensitive and whole-word; every lexicon ships complete in `content/rules.js`. A lint pass over a 1,000-word prompt takes **< 1 ms** in benchmarks (budget: 30 ms) — regexes are precompiled and all rules share one tokenization pass.

## Popup

Click the toolbar icon for: global kill switch, per-site toggles, per-rule-category toggles (synced via `chrome.storage.sync`), and your last 10 prompt scores — score, site, first 40 characters, timestamp (`chrome.storage.local`, device-only). A score is recorded when the composer empties after you had typed a prompt (the local-only proxy for "sent").

## Adapter-repair guide

These sites are SPAs and change their DOM regularly. When PromptLint stops appearing on a site, the fix is almost always a selector update in **one file** — each adapter documents its strategies inline:

| Site | File | Current strategies (in order) |
|------|------|-------------------------------|
| ChatGPT | `content/adapters/chatgpt.js` | `#prompt-textarea` → `div.ProseMirror[contenteditable]` → `form textarea` |
| Claude | `content/adapters/claude.js` | `div[contenteditable].ProseMirror` → aria-label contains *prompt/message/claude* → `fieldset div[contenteditable]` |
| Gemini | `content/adapters/gemini.js` | `rich-textarea .ql-editor` → `div.ql-editor[contenteditable]` → aria-label contains *prompt/enter* |
| Perplexity | `content/adapters/perplexity.js` | `#ask-input` → `textarea[placeholder^="Ask"]` → `main textarea` / `[role=textbox]` |
| (any) | `content/adapters/generic.js` | Largest visible contenteditable/textarea in a form-like container near a send button |

To repair: open the site, inspect the composer element (`$0` in DevTools), find a stable hook (id > aria-label > component class), and add/replace a strategy in the site's `findComposer()`. Return `{el, type: 'contenteditable' | 'textarea'}` or `null`. If the dedicated adapter returns `null`, `generic.js` is tried automatically; if that also fails, **the extension stays completely silent on the page** — it never breaks the host site.

Detection re-runs automatically on SPA navigation (URL change + DOM-settle debounce), so a composer that appears late or after a route change is picked up without a reload.

## Acceptance tests (walkthrough)

Verified during development — repeat after any change:

1. **Zero console errors**: load unpacked, open all four sites, check DevTools console — no PromptLint errors (silent `console.debug` only).
2. **ChatGPT, type `improve this`** → whole prompt gets High (red) underlines for *Vague ask* + *Dangling reference*; badge shows **< 60** (red). ✔ (unit-tested: score 60 − deductions → 40)
3. **Strong prompt** — *"Act as a senior product marketer. Based on my notes about our new budgeting app for freelancers, write a launch email for existing users. Format: 3 short paragraphs, friendly tone, under 150 words."* → **score ≥ 80**, minimal underlines. ✔
4. **`Write a blog post and also make a summary and then create titles and also suggest images`** → *Multi-ask overload* (Med); Restructure numbers the asks 1–4. ✔
5. **Restructure** produces the `Role/Context / Task / Details / Output format` skeleton with `[ADD: …]` placeholders for missing slots; **Insert into composer** replaces the text; **Ctrl+Z** restores the original (insertion goes through `execCommand('insertText')`). ✔
6. **Enter sends normally** with the extension active — the codebase contains no key listeners on the composer (grep for `keydown|keypress|keyup|preventDefault`: only a comment). ✔
7. **Broken primary selector** → next strategy finds the composer; all strategies + generic failing → site behaves as if the extension were absent. ✔ (adapters return `null` on failure; `main.js` no-ops)

Pure-logic tests (tokenizer, all 9 rules, scoring, restructure, 30 ms perf budget) were run under Node against the exact shipped files — 21/21 pass, 0.6 ms per 1,000-word pass.

## Privacy

- **Zero network requests** — no fetch/XHR/WebSocket/analytics anywhere in the code.
- Your prompts never leave the page; linting is pure local string processing.
- `chrome.storage.sync`: your toggle settings. `chrome.storage.local`: last 10 scores (score, site, first 40 chars, timestamp). That's everything stored.

## Chrome Web Store listing draft

**Title:** PromptLint — AI Prompt Linter
*(No third-party brand names in the title or listing — using another product's trademark, e.g. "Grammarly", in store metadata is a common impersonation-policy rejection.)*

**Summary (132 chars):**
`Underlines weak AI prompts as you type in ChatGPT, Claude, Gemini & Perplexity. Live score + 1-click restructure. 100% local.`

**Description:**

> Ever asked ChatGPT to "improve this" and gotten mush back? The problem usually isn't the model — it's the prompt.
>
> PromptLint is a real-time linter for your AI prompts. As you type in ChatGPT, Claude, Gemini, or Perplexity, it underlines the weak spots in your draft before you hit Enter:
>
> • Vague asks with no object or goal
> • Missing output format ("in what shape? how long?")
> • Dangling references ("fix this" — this *what*?)
> • Multi-ask overload (4 questions in one breath)
> • Missing context or audience, contradictions ("brief but comprehensive"), token-waste filler, and unbounded open-ended asks
>
> A live Prompt Strength score (0–100) sits at the corner of the composer. Click it for the full issue list with fix suggestions — or hit **Restructure prompt** to reorganize your own words into a clean Role/Context → Task → Details → Output format skeleton, with [ADD: …] markers showing exactly what's missing. Insert it back with one click; Ctrl+Z restores your original. It never sends anything for you.
>
> **Private by construction:** 100% local rule engine. Zero network calls, zero analytics, no account, and the only permission is "storage" for your own settings. Your prompts never leave the page.
>
> Better prompts in, better answers out.

**Category:** Productivity / Tools · **Language:** English

## File structure

```
promptlint/
├── manifest.json              # MV3, storage permission only
├── content/
│   ├── adapters/              # per-site composer detection (+ generic fallback)
│   ├── rules.js               # all 9 rules, complete lexicons inline
│   ├── restructure.js         # deterministic skeleton rewrite engine
│   ├── highlighter.js         # CSS Custom Highlight API + textarea mirror fallback
│   ├── badge.js               # floating score badge
│   ├── panel.js               # issue list / toggles / restructure UI
│   └── main.js                # orchestrator, 700 ms debounce loop
├── shared/
│   ├── tokenizer.js           # single shared tokenization pass
│   ├── storage.js             # settings (sync) + history (local)
│   └── ui-kit.js              # shadow-DOM helpers, design tokens, mini-card
├── popup/                     # toolbar popup (toggles + last 10 scores)
├── icons/                     # 16/32/48/128 PNGs
├── DECISIONS.md               # every judgment call, logged
└── README.md
```
