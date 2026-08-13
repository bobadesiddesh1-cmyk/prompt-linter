# DECISIONS.md — PromptLint

Decisions made where the spec was silent or ambiguous. Everything else follows the spec verbatim.

## Architecture

1. **No ES modules in content scripts.** MV3 content scripts declared in the manifest cannot use `import`/`export` without a build step. All files attach to a shared `window.PromptLint` namespace and are loaded in dependency order via the manifest `js` array. "Adapters export findComposer()" is therefore implemented as adapters registering `{hostSuffixes, findComposer}` objects on `PromptLint.adapters`.
2. **`::highlight()` styles are injected into the host document `<head>`**, not Shadow DOM. The CSS Custom Highlight API requires the `::highlight()` rules to live in a stylesheet that applies to the highlighted document; Shadow DOM styles cannot style host-page highlights. This is the single, unavoidable exception to "all UI in Shadow DOM" — it is one inert `<style>` tag with namespaced highlight names (`promptlint-*`) and cannot affect host layout.
3. **SPA navigation detection**: `popstate` listener + a lightweight 1 s `location.href` poll + a debounced `MutationObserver` that re-runs composer detection when the current composer is disconnected from the DOM. `history.pushState` is deliberately NOT monkey-patched (never mutate host-page globals).

## Rules

4. **Rule 1 "no object detail"** is implemented as: zero *substantive* words remain after removing generic verbs, pronouns, articles, and filler stopwords. So "improve this" flags, "improve my resume summary" does not (resume/summary are substantive).
5. **Rule 4 "dangling reference"** fires when a demonstrative (this/that/it/these/those) appears in the first 4 words, the prompt is a single sentence, and it is ≤ 10 words. The word cap prevents flagging long single sentences that reference then immediately describe their object ("fix this by refactoring the parse function in utils.py…").
6. **Rule 8** skips "short" when followed by "story/stories/film(s)" — genre usage, not a brevity instruction.
7. **Rule 5 clause splitting** uses the spec connectors (and/also/then/plus), semicolons, and sentence boundaries — bare commas are NOT split points (too many false positives on adjective lists).
8. **Numeric counts as format signals (Rule 2)**: a number counts as a format signal only when followed by a countable unit (words, bullets, paragraphs, steps, …). A bare "5" in "5 competitors" is not a format instruction. For Rule 7 (success criteria) any bare number qualifies as "quantity", per spec.
9. **Rule categories** (for toggles): Clarity = vague-ask, dangling-reference · Context = no-context, missing-audience · Format = no-output-format, no-success-criteria · Structure = multi-ask, contradiction · Style = filler.

## Scoring & history

10. **History entries are recorded when the composer transitions from non-empty (≥ 2 words) to empty** — the closest local-only proxy for "the user sent the prompt" that requires no keyboard/send interception. The input handler cheaply captures the latest non-empty text on each keystroke, and that final draft is scored at clear time — so the recorded score is accurate even when the user hits Enter faster than the 700 ms lint debounce.
11. **Empty composer** → badge shows a neutral "–" (gray), no underlines, no score deduction, nothing recorded.

## UI

12. **Overlapping ranges**: the Custom Highlight API path renders overlaps natively (separate Highlight registries per severity). The textarea mirror-overlay path cannot nest spans, so overlapping issues are rendered first-come (sorted by start, higher severity first); overlapped remainder is skipped visually but still listed in the panel.
13. **Hover mini-card** uses `document.caretRangeFromPoint` (contenteditable) / span `getClientRects` hit-testing (textarea mirror) on a throttled `mousemove` listener. No listeners ever call `preventDefault`/`stopPropagation`, and no `keydown`/`keypress`/`keyup` listener is attached to the composer — Enter/send is untouched by construction.
14. **"Insert into composer"** focuses the composer, selects all (`selectAll` for contenteditable, `setSelectionRange` for textarea), then `document.execCommand('insertText', …)` so the host page's native undo stack (Ctrl+Z) restores the original text.
15. **Copy button** tries `navigator.clipboard.writeText` and falls back to a temporary textarea + `execCommand('copy')` — no `clipboardWrite` permission needed (both run inside a click gesture).
16. **Panel/badge z-index** 2147483600-range, `position: fixed`, appended to `document.documentElement` so host page CSS resets can't reach them (plus Shadow DOM isolation with `:host` resets).
17. **Perplexity** now uses a contenteditable (`#ask-input`) on current builds but used a `<textarea>` historically; the adapter handles both, which also exercises the textarea mirror path.
18. **Restructure slot filling**: clauses are classified in priority order — format-signal clauses → Output format; role/context-marker clauses → Role/Context; imperative-start clauses → Task (numbered when > 1); everything else → Details. Filler phrases are stripped from all slots. Empty slots get `[ADD: …]` placeholders.
19. **Score is recomputed only from enabled categories** — toggling a category off removes its issues from underlines, panel, and score alike.
20. **Icons** are generated pixel-art PNGs (purple rounded square, white "prompt lines", red dotted underline motif) checked in as binaries; the generator script is not shipped in the extension folder.

## v1.0.1 — badge visibility & placeholder fix

21. **Badge redesign for discoverability**: the score-only colored pill blended into host-site buttons and read as part of the page. The badge is now a branded pill — purple "P" logo mark + grade-colored score (+ issue count) on a host-neutral light/dark background — showing the "PromptLint" wordmark when the composer is empty. It plays a soft two-beat glow pulse on mount (per page load, CSS-only) to catch the eye without nagging.
22. **One-time onboarding callout**: on the first run ever (flag in `chrome.storage.local`), a small bubble above the badge explains what PromptLint does and that the score is clickable. Dismissed by "Got it", clicking the badge, or a 15 s timeout — never shown again after acknowledgment.
23a. *(v1.0.2)* **"Aurora" brand identity**: unique tagline "Sharper prompts, better answers." (no comparisons to other products anywhere in code, listing, or docs). Brand gradient indigo #6366F1 → violet #8B5CF6 → fuchsia #D946EF used for the logo mark (✦ sparkle), restructure/callout buttons, popup switches and header mark. Score colors refreshed to emerald #10B981 / amber #F59E0B / rose #F43F5E. Severity underline colors unchanged (spec-mandated #EF4444/#F97316/#EAB308). Icons regenerated with 4× supersampling: gradient rounded square, white sparkle, white prompt line, gold dotted underline.

23. **Placeholder text treated as empty**: Perplexity's Lexical editor renders its "Ask anything" placeholder as real text nodes, which linted as a prompt and lit the badge green 100 on an empty box. Text identical to the composer's `placeholder`/`data-placeholder`/`aria-placeholder` (on the element or its first child) now counts as empty for linting, badge state, and history capture.


## v1.1.0 — draggable badge & maker branding

24. **The badge is draggable.** Users reported the fixed corner pill covering the composer's own controls. It now moves with a pointer drag; the offset from the composer corner is persisted **per site** in `chrome.storage.sync` (`badgePos[siteId]`), so it survives resizes, SPA navigation and reloads. A movement under 5px still counts as a click, so opening the panel is unaffected — verified by a test asserting a drag does *not* open the panel.
25. **Auto-dim while typing**: the badge drops to 40% opacity for 1.2s after each keystroke and returns to full opacity on hover, so it stops competing with the text underneath even before the user moves it. "Reset badge position" in the panel returns it to the corner.
26. **Maker attribution**: "Built with Siddesh" links to buildwithsiddesh.com from the panel footer and a popup card ("Made by a human who got tired of bad prompts."). All links are `target="_blank" rel="noopener noreferrer"`. `homepage_url` added to the manifest. This is attribution only — still zero network calls; nothing is fetched from that domain.
27. **Restructure score preview**: the panel now shows `Strength 50 → 100`, scoring the rebuilt prompt with the same rule engine. Verified across six representative weak prompts that the restructured version always scores strictly higher, so the number is never a discouraging surprise.

## v1.2.0 — library, shortcuts, quick fixes, stats, custom rules

28. **Prompt library** (`shared/library.js`): 20 built-in starter templates grouped by intent (Foundations / Learning / Writing / Analysis / Technical / Ideation), plus the user's own saved snippets. Snippets live in `chrome.storage.local`, **not sync** — sync caps items at 8 KB and the whole area at 100 KB, and prompt text is unbounded. Capped at 100 snippets. Templates use the same `[ADD: …]` markers as the restructure engine so the two features read as one idea.
29. **Keyboard shortcuts without a keydown listener**: the long-standing invariant is that PromptLint never attaches key listeners (Enter/send must stay untouchable). Shortcuts are therefore registered via the MV3 `commands` API and relayed by a service worker. The worker cannot use `chrome.tabs.sendMessage` — that needs host permissions this extension deliberately does not request — so **content scripts connect outbound** via `chrome.runtime.connect`, and the worker broadcasts to every port. Each content script ignores a command unless `document.hasFocus()`, so only the visible tab reacts. Defaults: Alt+Shift+P panel, Alt+Shift+R restructure, Alt+Shift+L library. Adds no permission warning.
30. **Quick-fix chips** (`content/quickfix.js`) are deliberately conservative: a fix either **deletes pure waste** (filler removal) or **appends a clearly-marked `[ADD: …]` scaffold** the user completes. It never invents content or rewrites the user's words — that would put words in their mouth. Issues with no honest mechanical fix (vague ask, dangling reference, contradiction) show advice but no chip. Multi-ask routes to the restructure engine, which already numbers the asks. All fixes go through the undo-preserving insert path, so Ctrl+Z reverts them.
31. **Stats** (`shared/stats.js`) are derived only from prompts already being scored — nothing extra is recorded. Stored per calendar day (30 days kept) in `chrome.storage.local`: totals, average, best, and a day streak. The streak displays as 0 when the last recorded day is older than yesterday, so a stale streak never shows as live. The popup compares the rolling 7-day average against the previous 7 days.
32. **Custom rules** live in `chrome.storage.sync` under `customRules: {banned, required}` and run as a sixth category, `custom`, honouring the same category toggle as the built-ins. Banned terms flag Med at the matched span; missing required phrases flag Low across the prompt. Both use the same case-insensitive whole-word matcher as the built-in lexicons, and a malformed entry is skipped rather than thrown.
