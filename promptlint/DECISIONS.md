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
