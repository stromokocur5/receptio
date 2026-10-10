# Receptio design system

Everything shared lives in `src/app.css`. Page and component `<style>` blocks only lay out
their own content; they don't re-create buttons, fields, chips, notices or titles.

## Tokens

| What             | Use                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Colours          | `--paper` page, `--card` cards, `--sunk` rows set into a card, `--ink`/`--ink-2`/`--muted` text, `--line` borders  |
| Accents          | `--leaf` (primary, success), `--tomato` (danger), `--turmeric` (warning), `--sky` (info), each with `-soft`        |
| Count/alert pill | `--alert-bg` + `--alert-ink` (never `#fff` on `--tomato`: unreadable in dark mode)                                 |
| Type             | `--fs-xs` 12 · `--fs-sm` 14 · `--fs-md` 15 · `--fs-base` 17 (body) · `--fs-lg` 20 · `--fs-xl` 23; h1–h3 are global |
| Space            | `--sp-1`…`--sp-7` = 4 8 12 16 24 32 48; stay on the 4px grid                                                       |
| Radius           | `--radius-xs` 8 (badges) · `--radius-sm` 14 (inputs, rows, tiles) · `--radius` 22 (cards, sheets) · 999px pills    |
| Layout           | `--gutter` page side padding (16 / 28px), `--header-h` sticky header, `--tap` 44px touch target                    |
| Overlay          | `--backdrop` for every dialog                                                                                      |

No hardcoded colours outside illustrations and charts; a colour that must work in both themes
is a token.

## Classes

- Page: `.wrap`, `.page`, `.eyebrow` + `h1` + `.lede`, `.back` (link above a detail title).
- Cards: `.card.box`, with `h2.section-title` (icon + text) as the card's title.
- Buttons: `.btn` (ink) for the main action, `.btn.leaf` for "add/save/go" primaries, `.btn.ghost`
  for secondary, `.btn.small`, `.btn.danger` (red outline; `.armed` red fill), `.btn-link` for a
  button inside text, `.icon-btn` (round, 44px on touch; `.plain` without fill).
- Choices: `.chips` > `.chip` (`aria-pressed` = on, always ink), `.segmented` for 2–4 exclusive
  views, `.check` for a checkbox row (text, then `<small>` for a note).
- Fields: `.field` (pill with icon, for search), `.input` (box, also on `select`/`textarea`;
  `.input.sm` inline).
- Feedback: `.notice` (+ `.danger`/`.warn`/`.ok`) always with an icon first; `.hint` for help
  under a control; `.empty` for nothing-here states; `.badge` for status labels.
- Disclosures: `<details class="disclosure">` — the whole summary row opens it, chevron down/up.
- Lists and bits: `.divided` (dashed line between items), `.sunk` (row in a card), `.stat-grid` >
  `.stat`, `.swatch` (ingredient colour dot, `--c`), `.accent-edge` (stripe, `--accent`),
  `.scroller` (sideways strip that reaches the screen edge), `.small`, `.muted`, `.sr-only`.

## Patterns

- **Deleting**: if it can be put back, do it at once and call `toast('Plán je prázdny', undo)` /
  `withUndo(...)` from `$lib/toast.svelte`. If it can't (server data, leaving, a new link), use
  `<ConfirmButton why="…">`. Never `window.confirm`, never a label that stays "Naozaj?".
- **Success**: swap the button's label and icon for ~2 s, or a toast without undo.
- **Errors**: `<p class="notice danger" role="alert"><Icon name="alert" /> …</p>`.
- **Loading**: `<p class="muted">Načítavam…</p>`; disabled buttons while busy.
- **Dialogs**: `<dialog>` with `showModal()`, closes on Esc and backdrop tap, close button is an
  `.icon-btn`; the page under it doesn't scroll (global rule).
- **Persisted state** is read only after `ui.loaded`, so the first render never flashes defaults.
- **Copy** addresses the reader as "ty", avoids gendered forms ("Chcem", not "Dal by som si"),
  and counts in Slovak plurals (1 vec, 2 veci, 5 vecí).
