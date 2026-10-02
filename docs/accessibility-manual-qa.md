# Accessibility manual QA checklist

Use this checklist before v1.0 and after material shell/widget changes. Record
the browser/OS/assistive-technology version and replace `Not run` with a result
plus issue link. Automated axe results do not satisfy these checks.

## Environment

| Item | Value |
| --- | --- |
| Build/commit | Not recorded |
| Browser + version | Not run |
| OS | Not run |
| Screen reader | Not run |
| Tester/date | Not run |

## Matrix

| Screen/feature | Keyboard | Zoom/reflow | Contrast | Screen reader | Reduced motion | Status messages | Notes/result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login/register + validation | Not run | Not run | Not run | Not run | Not run | Not run | |
| Trips dashboard/create/edit/delete | Not run | Not run | Not run | Not run | Not run | Not run | |
| Trip header/navigation/members | Not run | Not run | Not run | Not run | Not run | Not run | |
| Destinations + location edit | Not run | Not run | Not run | Not run | Not run | Not run | |
| Itinerary drag + keyboard reorder | Not run | Not run | Not run | Not run | Not run | Not run | |
| Itinerary click/tap Move | Not run | Not run | Not run | Not run | Not run | Not run | |
| Place combobox open/error/empty | Not run | Not run | Not run | Not run | Not run | Not run | |
| Map controls/markers/exit | Not run | Not run | Not run | Not run | Not run | Not run | |
| Route list/create/recalculate/delete | Not run | Not run | Not run | Not run | Not run | Not run | |
| Reservation create/transport/errors | Not run | Not run | Not run | Not run | Not run | Not run | |
| Expense equal/custom/errors | Not run | Not run | Not run | Not run | Not run | Not run | |
| Document upload/progress/cancel/error | Not run | Not run | Not run | Not run | Not run | Not run | |
| Realtime status/presence | Not run | Not run | Not run | Not run | Not run | Not run | |
| Notifications unread/actions/paging | Not run | Not run | Not run | Not run | Not run | Not run | |
| Trip search/results/filters | Not run | Not run | Not run | Not run | Not run | Not run | |
| Mobile navigation | Not run | Not run | Not run | Not run | Not run | Not run | |

## Procedure

1. Keyboard only: start at the URL bar, use Tab/Shift+Tab/Enter/Space/arrows/
   Escape. Verify skip-link visibility, meaningful order, no traps, visible and
   unobscured focus, dialog/inline-confirmation return, and current navigation.
2. Itinerary: complete the same reorder by pointer drag, sortable keyboard
   controls, and ordinary click/tap Move. Test same-Day and cross-Day first,
   middle, and last positions; verify focus remains on the moved item.
3. Combobox: verify ArrowDown/ArrowUp/Enter/Escape/Tab, pointer selection during
   input blur, active-option speech, loading/no-result/failure status, and no
   stale active descendant.
4. Map: focus and leave the map with Tab, operate visible zoom controls, select
   a marker, edit a coordinate, hear/read latitude/longitude, then Save/Cancel.
   Confirm all domain information/actions remain usable without the map.
5. Viewports: test 320px, 375px, and 768px widths; then desktop at 200% and
   400% zoom. Ordinary content must not require two-dimensional page scrolling,
   and controls/errors/navigation/cards must not clip.
6. Apply WCAG text spacing (line-height 1.5, paragraph spacing 2em,
   letter-spacing .12em, word-spacing .16em). Record overlap or loss.
7. Inspect normal/muted text, links, errors, borders, icons, focus, selection,
   and badges with browser contrast tooling. Do not infer contrast from JSDOM.
8. Enable forced-colors/high-contrast. Verify focus, current/pressed/selected,
   form boundaries, and status remain perceivable.
9. Enable reduced motion. Verify map camera updates are immediate, DnD/loading
   animation is reduced, and all functionality remains.
10. VoiceOver + Safari: verify login, Trips, Trip navigation, search, combobox,
    click/tap Move, one create/edit form, notifications, errors, and statuses.
    If Windows is available, repeat representative flows with NVDA + Chrome or
    Firefox.

No item is passed until a human records evidence. Current Stage 24 status:
automated JSDOM checks passed; browser/manual and screen-reader checks pending.

Stage 31 update (2026-10-02): Chromium six-screen axe, 320/375/768px reflow,
pointer/keyboard DnD + Move, keyboard menu/combobox/composer and skip link passed.
Only that scoped automated-browser debt is closed. Human matrix remains Not run:
VoiceOver + Safari, actual 200%/400% zoom, text spacing, forced colors, reduced
motion and repeated upload/cancel resource profiling are not passed by JSDOM or
viewport emulation. Record human evidence before changing this matrix.
