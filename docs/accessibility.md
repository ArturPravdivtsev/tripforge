# Accessibility

TripForge targets **WCAG 2.2 Level AA**. This is an engineering baseline, not
an accessibility certification or a claim of complete conformance. Automated
results are evidence for specific rules only; `0` axe violations does not prove
that a product is accessible.

## Product approach

- Native HTML comes first: links navigate, buttons act, forms use visible
  labels, sections use headings, and the shell exposes header/navigation/main
  landmarks.
- The first shell control is a focus-visible **Skip to main content** link. The
  destination is the single `main#main-content`; sticky-header offsets use a
  deliberate `5.5rem` scroll margin.
- Shared controls provide a high-contrast focus indicator and minimum heights
  of 40px (`sm`) or 44px (default). The shared border token is `#8793a5`, which
  is 3.11:1 against white; muted text is 5.40:1 against white; danger text is
  4.65:1 against its light error surface; the focus ring is 4.55:1 against
  white. These calculations guide the palette but do not replace rendered
  browser inspection.
- Essential state has text in addition to color: reservation/read/realtime
  states, errors, selection, upload phases, and expense allocation.
- Live regions are narrow and intentional. Failures use alerts; settled search,
  upload, reorder, and prolonged realtime outage/recovery messages are polite.
  The whole application shell is never a live region.
- `prefers-reduced-motion: reduce` collapses nonessential CSS animation and map
  camera durations. Forced-colors mode preserves focus/current/pressed/selected
  state with `currentColor`/system-color outlines.
- Responsive cards and wrapping controls remain the primary layout; no new
  desktop-only grid/table was introduced.

## Complex widgets

### Itinerary reorder

The original pointer and keyboard sortable behavior remains. A short hidden
instruction is referenced by every reorder handle, and a polite region reports
pickup, position/Day changes, drop, failure, and restoration without exposing
UUIDs. Focus returns to the moved item after persistence and to a logical item
or Day add control after deletion.

Keyboard sortable support is not treated as the WCAG 2.2 Dragging Movements
alternative. Every editable itinerary item also has a normal **Move** action:
choose a target Day, choose any final position (first/middle/last), then confirm.
It calls the same authoritative reorder endpoint and uses the same optimistic
cache, rollback, realtime-deferral, and invalidation path as drag-and-drop.

Destination Move Up/Move Down controls have resource-specific names, native
disabled state, 40px targets, and retain focus as keyed rows move.

### Place combobox

`PlaceSearchCombobox` follows the editable combobox/listbox pattern: visible
label, `role=combobox`, expanded state, valid conditional `aria-controls`, an
existing active descendant only, listbox/options, Arrow Up/Down, Enter, Escape,
and ordinary Tab exit. Searching, no-results, and unavailable states are polite
status text. Preventing mouse-down blur preserves pointer selection; it does not
block Tab or paste.

### Maps

The map is a supplementary labelled region. Destinations, itinerary cards,
route summaries, forms, and edit/delete controls are the canonical nonvisual
interface. Route LineStrings and popups add no map-only data. Markers are
keyboard-focusable because they select the same named item as the lists; each
has a concise accessible name. Visible MapLibre zoom buttons provide a
single-pointer alternative to wheel/pinch and receive 40px targets/focus.
Location preview announces the selected latitude/longitude and still requires
an ordinary Save button; map click never saves automatically.

## Forms and async UI

- Authentication uses visible labels, `username`, `current-password`, `name`,
  `email`, and `new-password` autocomplete tokens. Paste, password managers,
  and autofill are not blocked.
- Required controls expose native `required` where compatible. Zod/React Hook
  Form errors remain visible, set `aria-invalid`, reference stable per-instance
  IDs, and focus the first invalid field. Server failures use `role=alert`.
- Expense split choices use `fieldset`/`legend`; currency-specific decimal help
  and a polite allocated/remaining summary explain disabled submission.
- Reservation transport fields enter/leave normal DOM and tab order without
  forced focus when Kind changes.
- Uploads have a visible file label, accepted-format/size help, a labelled
  native `progress`, keyboard cancel, phase announcements, and no per-percent
  live-region spam.
- Decorative skeleton blocks are hidden while a textual loading status remains.

## Automated testing

`axe-core@4.13.0` runs directly in Vitest/JSDOM through
`apps/web/test/accessibility.ts`. The helper targets `wcag2a`, `wcag2aa`,
`wcag21a`, `wcag21aa`, `wcag22aa`, and reliable `best-practice` rules. Failure
output includes rule, impact, selector/failure summary, and help URL.

Two rules are deliberately disabled in this component helper:

- `color-contrast`: JSDOM has no rendered CSS/layout/canvas. Replacement:
  browser DevTools/axe plus the contrast checklist below.
- `region`: isolated component fragments do not own page landmarks.
  Replacement: shell semantic tests and route-by-route landmark inspection.

No Playwright configuration exists in this repository, so Stage 24 does not add
`@axe-core/playwright` or create an unrelated E2E platform. Browser axe remains
a future CI/E2E layer. `axe-core` is dev/test-only and is never called by
production code.

Representative axe coverage includes auth validation, Trips dashboard, Trip
workspace navigation, itinerary Move state, expanded place combobox, routes,
transport reservation errors, custom expense allocation, documents,
notification states, and loaded search results. Existing explicit semantic,
keyboard, focus, pointer, cache, and regression tests remain alongside axe.

Run:

```bash
pnpm test:a11y
```

## Audit inventory

Status is intentionally evidence-specific. Manual columns remain blocked until
someone records results in `accessibility-manual-qa.md`.

| Surface | Automated evidence | Keyboard/manual status | Notes |
| --- | --- | --- | --- |
| Authentication | Automated verified | Blocked by environment | labels, autocomplete, errors, focus, paste source audit |
| Trips dashboard | Automated verified | Blocked by environment | descriptive card actions, responsive cards |
| Trip workspace | Automated verified | Blocked by environment | `h1`, trip navigation, status states |
| Members | Automated verified | Blocked by environment | labelled roles/add form, inline confirmation |
| Destinations | Automated verified | Blocked by environment | named reorder, location text/save/cancel |
| Days | Automated verified | Blocked by environment | chronological list and labelled destination selects |
| Itinerary | Automated verified | Blocked by environment | drag, keyboard path retained, click/tap Move verified |
| Place search | Automated verified | Blocked by environment | expanded/active option/Escape/Tab behavior |
| Map | Automated boundary verified | Known limitation | WebGL, spatial navigation, and real controls require browser/AT |
| Routes | Automated verified | Blocked by environment | complete non-map summaries and selected state |
| Reservations | Automated verified | Blocked by environment | conditional transport and error associations |
| Expenses | Automated verified | Blocked by environment | grouped split and allocation status |
| Documents | Automated verified | Blocked by environment | upload semantics/progress/cancel/cards |
| Realtime presence | Automated verified | Blocked by environment | textual state/presence; restrained outage announcements |
| Notifications | Automated verified | Blocked by environment | unread text, descriptive actions, pagination |
| Trip Search | Automated verified | Blocked by environment | labelled search/filter, settled status, descriptive results |
| Mobile navigation | Automated verified | Blocked by environment | expanded/current/Escape/focus return |
| Shared UI primitives | Automated verified | Manual visual blocked | native controls, focus and target-size tokens |

## WCAG 2.2 mapping

This is a practical remediation map, not an exhaustive legal conformance report.

| Area | Relevant criteria |
| --- | --- |
| Structure, headings, labels, groups | 1.3.1, 2.4.6, 3.3.2 |
| Contrast, reflow, spacing, forced colors | 1.4.3, 1.4.10, 1.4.11, 1.4.12 |
| Keyboard, focus order/traps/visibility | 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11 |
| Skip link | 2.4.1 |
| Pointer and reorder alternatives | 2.5.1, 2.5.2, 2.5.7, 2.5.8 |
| Accessible names | 2.5.3, 4.1.2 |
| Errors and authentication | 3.3.1, 3.3.2, 3.3.7, 3.3.8 |
| Async/live feedback | 4.1.3 |

## Known limitations

- Real-browser keyboard traversal, focus obstruction, contrast, target size,
  200%/400% zoom, 320px reflow, text spacing, reduced motion, and forced-colors
  checks are not executable in the current browserless surface. A reusable
  checklist is ready; none are marked passed.
- VoiceOver + Safari and NVDA + Chrome/Firefox were not available. In
  particular, MapLibre spatial marker exploration has not been tested with
  VoiceOver touch interaction. All essential map data/actions remain in lists.
- The repository has no Playwright runner, so browser axe is deferred to the
  future CI/E2E stage instead of being simulated in JSDOM.

Accessibility changes do not alter RBAC, session/CSRF policy, presigned URLs,
REST contracts, or persisted data. Accessible names contain ordinary visible
resource names only—never tokens, confirmation codes, or signed URLs.
