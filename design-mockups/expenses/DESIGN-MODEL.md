# Expenses Hub — Design Model (APPROVED — implementing)

**Status:** ✅ APPROVED 2026-07-17 — implementing now.
**Scope (your call):** Expenses page only. Investments / Dashboard date pickers untouched this round.
**Date:** 2026-07-17

## Locked decisions (approved)
| Decision | Choice |
|---|---|
| Layout | **Design D** — full-width glossy summary card on top; **search + filter in a bottom command bar** (thumb zone); green **+ Add floats above** the bar's right edge. Mockup: `05-command-bar.html`. |
| Summary card | **Kept** (one wide card: total · txn count · ▲ vs-last-month · ◀▶ month steppers). |
| Search input | Bottom bar shows a **Search pill**; tapping it raises a real input **above the keyboard** (avoids the on-screen keyboard covering a bottom-pinned field). Filter stays a bottom-sheet modal. |
| Views | **List | Calendar** toggle only. Events reached via the filter sheet's 🎉 Group by Events (not a 3rd toggle). |
| Events | Separate but modernized; pink-rose identity; **date-filter-aware**. |
| Budget month | **KEEP** — Month/Year presets honor `budgetMonth`/`budgetYear`; Day/Week use actual date. No behavior loss. |

---

## 0. The key insight — no data changes needed

Expenses, "recurring shown this month," and events are **already the same data**:

- Every expense lives in `window.DB.expenses` with a `YYYY-MM-DD` `date`.
- An **event** is not a separate entity — it's just an `event: "Goa Trip"` **string tag** on an expense.
- **Recurring** templates live in `DB.recurringExpenses`, but they **auto-write real expense rows** into `DB.expenses` each month (`autoAddToExpenses()`), plus card/loan EMIs do the same.

So this redesign is a **render-layer rebuild only**. No schema migration, no data backfill, no risk to stored data. That is the safest possible footing.

---

## 1. What's wrong today (why modernize)

| Problem | Today |
|---|---|
| Fragmented UI | Purple date-list + a separate **orange "recurring" block with old Upcoming/Completed tabs** (the exact pattern we just deleted from the Recurring page) + a **pink Events mode**. Three visual languages on one page. |
| Date filter is heavy | Full-screen **modal** (`#date-filter-modal`) to change period. Presets: Today / 7 days / This Month / This Year / All Time. |
| Events ignore the date filter | Switching to Events shows **all events across all time**, silently bypassing the selected range — confusing. |
| Recurring-this-month uses dead pattern | Manual tab toggling (`switchRecurringTab`), blue/green cards, `<details>` — dated and inconsistent. |
| Small tap targets, inline handlers, no aria | Same rough edges we cleaned up on Recurring. |

---

## 2. Target architecture — one date-driven hub

```
┌─────────────────────────────────────────────┐
│  HERO (glossy twin tiles · purple→pink)       │
│  ┌───────────────┐  ┌───────────────┐         │
│  │ This Month    │  │ vs June        │         │
│  │ ₹55,042       │  │ ▲ ₹3,000       │         │
│  │ 42 txns       │  │ +5.5%          │         │
│  └───────────────┘  └───────────────┘         │
│                                                │
│  DATE FILTER (always visible — no modal)       │
│  [Day] [Week] [Month] [Year] [Custom]          │
│  ◀   July 2026   ▶            (Today)          │
│                                                │
│  VIEW TOGGLE   [ List | Calendar | Events ]    │
├─────────────────────────────────────────────┤
│  (content depends on view — all obey the       │
│   date filter above)                           │
└─────────────────────────────────────────────┘
```

**Three views, one filter.** The date filter + hero sit above a segmented toggle; every view reads the same `startDate/endDate`. This is the "modernize the filter-by-date pages" ask, delivered for the expenses hub.

### 2a. List view (default)
- **Filter pills** with live counts: `All (42) · Recurring (6) · One-off (36)`. (Same pill component as Recurring.)
- **Date-grouped cards**, newest first, each day header showing the day's subtotal.
- Each row: **category avatar** (emoji on gradient, from the 18-category registry) · title · category chip · payment-method icon · amount (`tabular-nums`, ₹ Indian grouping). Tap → details modal. Edit/delete with `aria-label`s.
- **Recurring, modernized (your explicit ask):**
  - Recurring rows already added this month show inline with a 🔁 badge.
  - Recurring **due this month but not yet added** appear as subtle **"pending" cards with a one-tap `+ Add`** — replacing the old Upcoming/Completed tabs entirely. Reachable via the **Recurring** pill.
- Event-tagged rows show a small 🎉 chip inline, so you still *see* them in the timeline (the full thematic breakdown lives in the Events view).

### 2b. Calendar view
- Month grid mirroring the approved Recurring calendar (leading blanks, correct days-in-month, today-ring only in the current month, selected-day highlight — reuses the **already-verified** date math).
- Each day cell: day number + **category dots** for spend that day.
- Tap a day → **detail panel** below with that day's transactions + day total.
- The **Month** date-preset and the calendar's month stay in sync.

### 2c. Events view (separate but modernized — your call)
- Keeps its **pink-rose identity** and the event → title → expense drilldown, restyled with the new kit (category avatars, ₹ formatting, bigger tap targets, aria).
- **Now date-filter-aware:** only events with expenses **in the selected range** appear, with a clear "Showing: Jul 2026" note + a one-tap "All time" escape. (Fixes today's silent-bypass bug.)

---

## 3. State model (persists across navigation)

All stored as **module properties on `window.Expenses`** (not locals) so they survive `Navigation.navigateTo('expenses')` re-renders — the same discipline that made the Recurring page stable. `render()` must **never reset** these (init-only guard when null).

| Property | Values | Purpose |
|---|---|---|
| `viewMode` | `'list'` \| `'calendar'` \| `'events'` | which view |
| `datePreset` | `'day'`\|`'week'`\|`'month'`\|`'year'`\|`'custom'` | drives start/end |
| `startDate`, `endDate` | `YYYY-MM-DD` | the active range (exists today) |
| `listFilter` | `'all'`\|`'recurring'`\|`'oneoff'` | List pills |
| `calYear`, `calMonth`, `calSelectedDay` | ints | Calendar view (mirrors Recurring) |
| `searchTerm` | string | search (exists today) |
| `expandedGroups` | Set | collapse state (exists today) |

---

## 4. Preserved public API (hard contract — will NOT change)

Other modules depend on these; all signatures stay identical:

- **Called by RecurringExpenses / Cards / Loans:** `Expenses.add(...)`, `Expenses.isDismissed(...)`, `Expenses.addRecurringExpenseById(...)`.
- **Called by Navigation / Dashboard:** `Expenses.render()`, `Expenses.getAll()`, `Expenses.getByDateRange(...)`, `Expenses.getById(...)`, `Expenses.update(...)`, `Expenses.delete(...)`.
- **Events module:** `Events.getEventSummary(...)`, `Events.renderInExpensesList(...)` — kept; the Events view still delegates here (restyled internally).
- Auto-add pipeline (`Cards.autoAddEMIExpenses`, `Loans.autoAddToExpenses`, `RecurringExpenses.autoAddToExpenses`) keeps running on render.

**Container stays `#expenses-list`** (and the events sub-container), so `index.html` needs no structural change.

---

## 5. Filter semantics — the one decision that needs care

Today the code switches between **budget-month** and **actual-date** filtering depending on span (a "paid in May, track in June" feature via `budgetMonth`/`budgetYear`). Proposed:

- **Keep `budgetMonth` honored** for Month/Year presets (no behavior loss), use actual date for Day/Week. Same rule as today — just surfaced through the new preset bar.
- If you'd rather **simplify to pure actual-date** everywhere (drop budget-month remapping), say so — it's cleaner but changes where a few remapped expenses appear. **Default: keep current behavior.**

---

## 6. Design kit reused from the approved Recurring page

Glossy twin hero tiles · segmented toggle with `aria-pressed` · filter pills with count badges · `_categoryAvatar()` / `_categoryDotClass()` · calendar grid math · ₹ `Utils.formatIndianNumber` · `Utils.escapeHtml` on all user text · `Utils.applyCurrencyMask` on any live currency input. **Family:** expenses = `purple→pink`; events content = `pink→rose`.

---

## 7. Risks & how they're handled

| Risk | Mitigation |
|---|---|
| Breaking external callers | Freeze the §4 API; regression tests assert each. |
| Date math bugs | Reuse Recurring's verified helpers (leap-year clamp, today-ring). |
| Recurring "Add" / EMI auto-add regressions | Preserve `addRecurringExpenseById` + auto-add pipeline; test them. |
| State reset on nav | Module-property state + init-only guard (proven on Recurring). |
| XSS via titles/event names/card names | `escapeHtml` every interpolation (we found + fixed one such bug on Recurring). |
| Test suite | Add render + preserved-API tests; keep suite green (currently **708**). |

---

## 8. What implementation will look like (AFTER approval)

1. Rebuild `expenses.js` render layer (List/Calendar/Events + date-filter bar + hero) — agent team.
2. Restyle `events.js` `renderInExpensesList` + make it range-aware.
3. Remove dead code (`switchRecurringTab`, old modal wiring) after confirming no refs.
4. Regression tests (`test/unit/expenses.test.js` additions) — must stay green, fail-closed pre-commit.
5. `npx cap sync android`.

**Nothing above is built yet.** Review the doc + the HTML mockup, tell me what to change, and I'll proceed only on your confirmation.

---

## 9. Implementation notes (as-built, 2026-07-17)

Discovered during pre-implementation research and worth recording:

- **The current app already has** the fixed bottom search+filter bar (`index.html` ~662), the glossy purple→pink summary card (`#expenses-summary` ~615), and the FAB above the bar. So Design D's "controls at bottom + keep summary" is largely **preserve, don't rebuild**. `index.html` needs no structural change — the whole redesign is in `expenses.js` (render layer) + `events.js`.
- **State:** `viewMode` stays `'expenses'|'events'` (external writers: `events.js`, filter modal). New **`bodyView: 'list'|'calendar'`** drives the toggle; new `calYear/calMonth/calSelectedDay` for the calendar; new `eventsAllTime` for the events "All time" escape. All module properties, init-only-guarded.
- **Month steppers → Calendar view only.** The summary card stays a *range* summary (total · count · range · loans toggle). Month ◀▶ steppers belong to the Calendar (inherently monthly, mirrors Recurring); putting them on the summary would conflict with the flexible Day/Week/Year/Custom/All presets. Reasoned deviation from the mockup's card steppers.
- **Search stays a live `<input>`** in the existing bottom bar (proven, already ships) rather than the mockup's tap-to-raise pill — lower risk, same thumb position. Deviation from mockup noted.
- **Recurring modernized:** already-added recurring show inline in the timeline with a 🔁 badge; only *not-yet-added* items render as dashed **"Due this month" + Add** cards. Removes the old Upcoming/Completed `<details>` tabs, `switchRecurringTab`, `currentRecurringTab`. (Latent bug fixed: the old "+ Add" wired `addRecurringExpenseById(recurringId,…)` for card/loan EMIs that have no `recurringId` — those now show a "🔁 auto" tag instead of a broken button, since EMIs auto-add on their due date.)
- **Events range-aware:** `Events.getEventSummary`/`renderInExpensesList` gain an optional range arg (default = all-time, preserving behavior + the untested contract). Fixes the silent date-filter bypass.
- **Contract safety:** the 16 test-covered business methods + external API (`add/update/delete/getById/getByDateRange/getByCategory/getTotalAmount/getFilteredExpenses/groupByMonth/getEventNames/getEventSummary/isLoanEMIExpense/isAutoRecurringExpense/getExpenseBudgetMonth/isDismissed/getAll`, plus `render/addRecurringExpenseById/updateFilters/updateSummary/showExpenseDetails/toggleMonth/toggleLoansInTotal`, `viewMode`) are unchanged.
