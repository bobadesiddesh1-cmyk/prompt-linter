# Chrome Web Store submission guide — PromptLint v1.0.2

Everything below is paste-ready for the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Fields appear in dashboard order.

## 0. The package

Upload **`promptlint-v1.0.2-store.zip`** (built from `promptlint/` with `manifest.json` at the **root of the zip** — the Web Store rejects zips where the manifest is nested inside a folder).

Rebuild it any time with:

```bash
cd promptlint && zip -r ../promptlint-v1.0.2-store.zip . -x "README.md" -x "DECISIONS.md"
```

## 1. Store listing

| Field | Value |
|---|---|
| **Title** | `PromptLint — AI Prompt Linter` |
| **Summary** (≤132 chars) | `Underlines weak AI prompts as you type in ChatGPT, Claude, Gemini & Perplexity. Live score + 1-click restructure. 100% local.` |
| **Category** | Productivity → Tools |
| **Language** | English |

**Description** (paste as-is):

```
Ever asked ChatGPT to "improve this" and gotten mush back? The problem usually isn't the model — it's the prompt.

PromptLint is a real-time linter for your AI prompts. As you type in ChatGPT, Claude, Gemini, or Perplexity, it underlines the weak spots in your draft before you hit Enter:

• Vague asks with no object or goal
• Missing output format ("in what shape? how long?")
• Dangling references ("fix this" — this *what*?)
• Multi-ask overload (4 questions in one breath)
• Missing context or audience, contradictions ("brief but comprehensive"), token-waste filler, and unbounded open-ended asks

A live Prompt Strength score (0–100) sits at the corner of the composer. Click it for the full issue list with fix suggestions — or hit "Restructure prompt" to reorganize your own words into a clean Role/Context → Task → Details → Output format skeleton, with [ADD: …] markers showing exactly what's missing. Insert it back with one click; Ctrl+Z restores your original. It never sends anything for you.

Private by construction: 100% local rule engine. Zero network calls, zero analytics, no account, and the only permission is "storage" for your own settings. Your prompts never leave the page.

Better prompts in, better answers out.
```

**Listing rules honored** (common rejection causes):
- No third-party trademarks (Grammarly/OpenAI/Google/Anthropic logos or brand names as branding) in title, summary, or icon. Site names appear only factually, to state where the extension works — that is allowed.
- No keyword stuffing; description describes actual functionality only.
- Icon is original art (purple rounded square with underlined text lines).

## 2. Graphic assets (you must capture these)

- **Screenshots**: 1280×800 (or 640×400), 1–5 images, PNG/JPG. Suggested shots: (1) red underlines + low score on "improve this" in ChatGPT, (2) the panel with issue list, (3) the Restructure skeleton, (4) the popup with toggles + history. Take them at 100% zoom in a clean browser profile with no other extensions visible.
- **Small promo tile**: 440×280 (optional but recommended).
- Do **not** include other companies' logos in promo images.

## 3. Privacy tab

| Field | Value |
|---|---|
| **Single purpose** | `PromptLint analyzes the prompt a user is typing into an AI chat composer (ChatGPT, Claude, Gemini, Perplexity) locally, and displays writing-quality feedback: underlined issues, a strength score, and an optional local restructuring of the user's own text.` |
| **Permission justification — `storage`** | `Stores the user's on/off preferences (global, per-site, per-rule-category) in chrome.storage.sync, and the last 10 locally computed prompt scores in chrome.storage.local so the popup can display them. No other data is stored.` |
| **Host permission justification (content scripts on the 4 sites)** | `Content scripts must run on chatgpt.com, claude.ai, gemini.google.com and perplexity.ai to read the prompt composer's text and render underlines and a score badge on those pages. Analysis is fully local; the extension makes no network requests and runs on no other sites.` |
| **Remote code** | No, the extension does not use remote code. *(All JS is packaged; there is no eval of fetched code, no CDN scripts.)* |
| **Privacy policy URL** | `https://github.com/bobadesiddesh1-cmyk/prompt-linter/blob/main/PRIVACY.md` |

**Data usage disclosures**: check **"Does not collect or use user data"** — every category (personally identifiable info, health, financial, authentication, communications, location, web history, user activity, website content) is **not collected**. The prompt text is processed in-memory on the user's device and never transmitted; the score history stays in local storage. Then check all three certifications (no sale of data, no use unrelated to single purpose, no use for creditworthiness).

## 4. Distribution

- Visibility: Public (or Unlisted for a soft launch).
- Regions: all.
- Pricing: free.

## 5. Pre-flight checklist (verified for v1.0.2)

- [x] `manifest.json` at zip root; loads unpacked with zero console errors.
- [x] Manifest V3; `minimum_chrome_version: 105` (CSS Custom Highlight API).
- [x] Only permission requested: `storage`. No `activeTab`, no `<all_urls>`, no unused permissions.
- [x] Content scripts limited to exactly the four sites the listing names.
- [x] Zero network calls / analytics anywhere in the code (grep-verified: no fetch, XHR, WebSocket, or external URLs).
- [x] No remote code, no eval, no CDN.
- [x] No third-party trademarks in name, icon, or listing copy.
- [x] Description matches actual behavior 1:1 (reviewers test this).
- [x] Icons 16/32/48/128 present and referenced.
- [x] Privacy policy published and linkable.
- [x] Never intercepts Enter/send or any host-page keyboard handling.

After submission, first review typically takes a few business days. If rejected, the email names the policy — fix, bump `version` in the manifest, re-zip, resubmit.
