# Expenses and shared costs

## Exact money

TripForge stores money as an uppercase runtime-supported currency code plus an
integer number of minor units. `EUR 12.50` is `EUR + 1250`, `JPY 1500` is
`JPY + 1500`, and `KWD 1.234` is `KWD + 1234`. PostgreSQL uses `bigint`; API and
browser values are constrained to JavaScript safe integers. Major-unit input is
kept as a string and parsed digit-by-digit. Floating-point major-unit arithmetic,
scientific notation, rounding, and locale-dependent decimal parsing are not used.
The canonical input separator is `.`.

Currency validation uses the current Node/browser runtime's standardized
`Intl.supportedValuesOf("currency")` catalog. Fraction digits come from
`Intl.NumberFormat` metadata rather than a two-decimal assumption. Runtime
catalogs can evolve and can retain historical ISO 4217 codes; acceptance does
not claim that every code is current legal tender. Review the runtime and its
internationalization data during platform upgrades.

TripForge performs no FX conversion in Stage 18. Totals, balances, and
settlements are independent per currency. A cross-currency grand total would
require a rate, source, timestamp, and conversion policy and is therefore not
shown.

## Aggregate and lifecycle

`trip_expenses` owns title, category, local `spent_on` date, currency,
`amount_minor`, one payer, split method, notes, and an optional reservation.
`trip_expense_splits` uses `(expense_id, user_id)` as its primary key and stores
each debtor's exact minor-unit share. The payer need not be a debtor.

Creation inserts expense plus shares in one transaction. Updates merge the
PATCH, derive the final aggregate, validate it, then update the expense and
replace shares when required in one transaction. The application enforces at
least one share and `SUM(shares.amount_minor) = expense.amount_minor`; normal row
checks cannot enforce this cross-row invariant. Database checks enforce range,
shape, uniqueness, and referential integrity. No trigger is used for split totals.

Equal splits sort user IDs lexicographically, use integer division, then give
one remainder unit to the first stable IDs. For `100 / 3`, the result is
`34, 33, 33`, regardless of request order. Custom shares must be unique,
non-negative safe integers whose exact sum equals the expense total.

An equal-split amount edit without a split payload recalculates the existing
participant set. A custom-split amount edit requires an explicit replacement
split. Changing split method always happens through an explicit split payload.
Changing currency only changes denomination; it never converts amounts.

Removing a Trip member does not alter their historical payer/share facts or
balances. Preserved former participants may remain during later edits, while a
newly introduced participant must currently belong to the Trip. Current access
and historical financial participation are deliberately separate. Participant
foreign keys point to users, not memberships; no user-account deletion workflow
is introduced by this stage.

Deleting a linked reservation sets `reservation_id` to null and keeps the
expense. Deleting an expense cascades to its shares. Deleting the Trip cascades
to all expense data. Reservation creation never creates an expense automatically.

## Balances and settlements

For every expense the payer receives `+amountMinor`; every share contributes
`-share.amountMinor`. Thus `net = paid - owed`, and every currency group must sum
to exactly zero. Positive participants should receive money; negative
participants owe it. Former members remain included when historical rows refer
to them.

Suggested settlements are derived, not persisted. For each currency, creditors
and debtors are sorted by largest absolute balance and then `userId ASC`; a
deterministic greedy match emits only positive debtor-to-creditor transfers.
Editing or deleting an expense immediately changes the suggestions. Actual
payments and “mark settled” state are deferred.

## Access and privacy

Owners and editors can read and mutate expenses. Viewers can read expenses,
balances, and settlements but cannot mutate them. Unrelated users receive the
same scoped Trip `404` as for other private Trip resources. All authorized Trip
participants can see amounts, payer, shares, balances, and settlement
suggestions. Private per-user expenses are not part of Stage 18.
