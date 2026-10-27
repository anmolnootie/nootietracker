# Logic Sheet

Every piece of business logic the app actually runs — rules, thresholds, formulas, and automated decisions — in one place. This is a snapshot of the code as of 2026-10-27; when a rule changes, update this file in the same commit. For *why* a rule exists or how it was built, see `CLAUDE.md`'s Project Log instead — this file documents *what* the logic currently does, not its history.

Each entry names the file it lives in so you can jump to the source instead of trusting this doc blindly.

---

## 1. Status Engine — `src/engines/status.engine.ts`

PO status is **always derived, never manually set** (outside terminal states). `deriveStatus()` walks the milestones in order and returns the first stage not yet complete:

| Status | Condition |
|---|---|
| `RECEIVED` | No appointment record yet |
| `APPOINTMENT_REQUESTED` | Appointment requested, not confirmed |
| `APPOINTMENT_CONFIRMED` | Confirmed, dispatch not yet actioned |
| `READY_FOR_DISPATCH` | Confirmed + dispatch record exists, not yet dispatched |
| `DISPATCHED` | Dispatched, no logistics tracking status yet |
| `IN_TRANSIT` | Logistics status set and not `DELIVERED` |
| `DELIVERED` | Logistics status `DELIVERED`, no GRN date yet |
| `GRN_PENDING` | GRN date recorded, no outcome yet |
| `RECONCILED` | GRN outcome recorded |

`RETURNED`, `CANCELLED`, `CLOSED` are terminal and set explicitly elsewhere (Returns/CN flow) — `recomputeStatus()` in `po.service.ts` refuses to touch a PO already in one of these.

Recomputed every 5 minutes for every non-terminal PO (`automation.service.ts: recomputeRiskAndStatus`), plus inline after any event that could move it (GRN recorded, dispatch marked, etc).

---

## 2. Risk Engine — `src/engines/risk.engine.ts`

Two outputs: a risk color and a 0–100 priority score.

**Risk color** — band by days-to-expiry, thresholds **admin-editable** via System Settings (`ConfigService`, see §13), defaults:

| Color | Days to expiry |
|---|---|
| BLACK | < 1 |
| RED | < 2 |
| ORANGE | < 4 |
| YELLOW | < 7 |
| GREEN | ≥ 7 |

Overrides on top of the band:
- `hasDelays` (dispatch past its latest-safe-date, not yet dispatched) bumps YELLOW→ORANGE and ORANGE→RED.
- `hasDiscrepancies` forces RED unless already BLACK.

**Priority score** (0–100): `min(100, expiryScore + stageScore + delayPenalty + discrepancyPenalty)`
- Expiry: `max(0, min(50, 50 - daysToExpiry × 3.57))` — 0 days out = 50 pts, ~14 days out = 0 pts.
- Stage: later-stage POs score higher if still open (`GRN_PENDING` = 28, `DELIVERED` = 25, `IN_TRANSIT` = 20, … `RECEIVED` = 0).
- +10 if `hasDelays`, +10 if `hasDiscrepancies`.

Risk moving to RED/BLACK fires a `RISK_ESCALATED` notification to the PO's `overallOwnerId`. Recomputed on the same 5-minute cron as status.

---

## 3. Location Dispatch Engine — `src/engines/location-dispatch.engine.ts`

The "Dynamic Dispatch Date Engine." Computes a dispatch window purely from live data (PO date, PO expiry, and the Location Master's current TAT config) — **never stored as final**, always recomputed.

- **LOCAL**: single checkpoint = `expiry − localTatHours` (default 48h). Window collapses to one day.
- **NON_LOCAL**: window between `expiry − max(minDays,maxDays)` (earliest) and `expiry − min(minDays,maxDays)` (latest); recommended = midpoint, rounded. Defaults: 8–10 days.
  - Codebase convention (not enforced by the math, since it takes min/max either way): `nonLocalTatMaxDays` holds the *smaller* number (closer to expiry), `nonLocalTatMinDays` holds the *larger* number (furthest from expiry).
- Every computed date is floored at the PO's own `poDate` — a dispatch date can never be calculated as earlier than the PO itself was placed.

**Dispatch plan status** (`computeStatus`): `DISPATCHED` if actually dispatched; else `CRITICAL` if today ≥ expiry; `DISPATCH_OVERDUE` if today > window-latest; `DISPATCH_NOW` if today ≥ window-earliest; else `NOT_DUE`.

**Variance** (`computeVariance`): actual vs. recommended dispatch date → `EARLY` / `ON_TIME` / `LATE` + day count.

Recomputed every 5 minutes for every open PO, and inline whenever a PO/location changes.

---

## 4. Dispatch Planning Engine — `src/engines/dispatch-planning.engine.ts`

Older/simpler engine, still used once at PO creation (`createPO`, `reattemptDelivery` in `po.service.ts`) to seed `idealDispatchDate` / `latestSafeDispatchDate` on the Dispatch record:

- Ideal dispatch date = `poDate + transitTimeDays` (from the transporter's SLA, default transporter "DEFAULT", 2 days if none found).
- Latest safe dispatch date = `poExpiryDate − (appointmentRequirementDays + transitTimeDays + safetyBufferDays)`, defaults 3/2/1, then rolled forward to the next customer receiving day (default Mon/Wed/Fri).

Note: the *live*, continuously-recomputed dispatch window shown on the PO screen is the Location Dispatch Engine above (§3), not this one — this one is a one-time seed value.

---

## 5. Fulfilment Status Engine — `src/engines/fulfilment-status.engine.ts`

A second, distinct health color (GREEN/YELLOW/ORANGE/RED) from Risk — reads quantity fulfilment + appointment proximity + dispatch health, not just days-to-expiry. Thresholds are a documented interpretation of the spec, tunable here:

- **RED**: cancelled PO with pending qty, OR past expiry, OR appointment expired with pending qty, OR dispatch plan `CRITICAL`, OR a quantity mismatch exists.
- **ORANGE**: ≥30% of ordered qty still pending, OR appointment ≤2 days out with pending qty, OR dispatch `DISPATCH_OVERDUE`, OR ≤2 days to expiry.
- **YELLOW**: any pending qty, OR appointment ≤5 days out, OR ≤5 days to expiry.
- **GREEN**: otherwise.

---

## 6. Reconciliation Engine — `src/engines/reconciliation.engine.ts`

Runs per-row during bulk import to catch data inconsistencies, raising `ExceptionEntity` rows:

- **QUANTITY_MISMATCH**: `ordered ≠ delivered + pending` (tolerance 0.01).
- **VALUE_MISMATCH**: `poValue ≠ qty × unitPrice` (tolerance ₹1).
- **MRP_MISMATCH**: cross-references a UPC's MRP against every other line item sharing that UPC across *all* live POs. The majority MRP (by units) wins; anything priced differently is flagged, with financial impact = `|thisMrp − majorityMrp| × orderedQty`. This is the one check that can't be done row-locally — it needs the whole system's state.

`hasMrpMismatch()` exposes the same majority-price logic standalone for the Fix & Recompile flow to decide whether a corrected row still disagrees.

---

## 7. Automation Service (cron jobs) — `src/modules/automation/automation.service.ts`

| Job | Cadence | Rule |
|---|---|---|
| `recomputeRiskAndStatus` | every 5 min | Recomputes status, risk, dispatch plan for every non-terminal PO |
| `escalateOverdueTasks` | every 1 min | Any `OPEN` task past `slaDueAt` → escalated (§8). Excludes `AVV_FOLLOWUP` (has its own cycle) |
| `closeMootAppointmentTasks` | every 5 min | Auto-closes an open `APPOINTMENT` task if: PO no longer open, OR a slot is now booked, OR PO already dispatched |
| `dispatchedShipmentsTrackingCheck` | every 5 min | Any dispatched-with-docket PO missing a Logistics Tracker row gets one (closes a gap where the master-sheet-driven dispatch path skips the manual-dispatch-only tracker creation); also promotes trackers to `DELIVERED` once the sheet says so |
| `avvFollowUpCheck` | every 5 min | **AVV Rule**: dispatch date + 3 days → first reminder task. If not actioned, repeats every 2 days until "Received & Actioned" or PO closes |
| `appointmentExtensionCheck` | every 5 min | **Extension Rule**: no slot booked + 0–4 days to expiry + not yet dispatched → auto-creates an Extension Request task (once per appointment) |
| `deliveredAwaitingGrnCheck` | every 5 min | Any delivered PO (by sheet status or app status) with no GRN record gets a GRN placeholder + task; owners get one batched notification, not one per PO |
| `grnAgeingCheck` | every 5 min | GRN still open 24h+ after creation and no existing unresolved GRN task → raises one |
| `markExpiredUndispatchedNotFulfilled` | every 1 hour | PO 2+ days past expiry (`NOT_FULFILLED_GRACE_DAYS`), still "Fulfilled", never dispatched (no dispatch date/status/invoice/AWB, no dispatched qty, no GRN, not on the master sheet, never manually decided) → auto-marked `NOT_FULFILLED` (reason `PO_EXPIRED`). Never overrides a human decision |
| `recallCheck` | every 5 min | **Recall + CN Rule**: PO past expiry AND was dispatched (any of date/status/invoice/AWB signals it) AND not delivered/GRN'd AND no active extension covering it → opens a `RECALL_NOT_DELIVERED` Return row (idempotent, see §10) + raises a `RETURN_CN` task, once |

Shared terminal-status guard: `CLOSED`, `CANCELLED`, `RETURNED`, `RECONCILED` POs are skipped by every sweep above.

---

## 8. Task Escalation — `src/modules/tasks/tasks.service.ts`

- A task overdue (`slaDueAt` passed, still `OPEN`) is escalated by reassigning it to a `SCM`/`ADMIN` user and marking it `ESCALATED` (not completed — the work still needs doing).
- **Self-escalation-skip**: if the current owner already holds an SCM/ADMIN role, escalating to themselves is a no-op, so the next *distinct* SCM/ADMIN is picked instead.
- "Unresolved" (used by most task-existence checks) = anything not `COMPLETED`, i.e. `OPEN` or `ESCALATED` both count as still outstanding.

---

## 9. Stuck Stock — `src/modules/stuck-stock/stuck-stock.service.ts`

Runs every 10 minutes (`scheduledDetection`) plus on-demand.

**Is a PO a stuck candidate?** `CANCELLED` or `RETURNED` status, OR marked `NOT_FULFILLED`, OR past expiry and not in a "delivered/closed" state.

**Reason inference**: `PO_CANCELLED` (cancelled status or reason), `RTO` (returned), `APPOINTMENT_EXPIRED` (that non-fulfilment reason), else `EXPIRED_PO` if past expiry, else `OTHER`.

One row per (PO, SKU) with leftover qty > 0 (`quantity − dispatchedQuantity`), valued at unit price (falling back to `lineValue/quantity`). Re-running never resets a row already `RESOLVED`/`WRITTEN_OFF`; any previously-open row no longer matching gets auto-`RESOLVED`.

**Aging buckets**: 0-7 / 8-15 / 16-30 / 31-60 / 60+ days since `firstDetectedAt`.

**Recovery**: `applyRecovery()` deducts recovered qty only once the *new* PO's GRN actually completes (not when a mapping is merely created) — a fully-recovered line auto-resolves, a partial one stays `MAPPED`/`PARTIALLY_MAPPED` with a smaller effective balance.

---

## 10. Returns Service — `src/modules/returns/returns.service.ts`

- **Idempotent recall creation** (`createIfMissing`): wrapped in a per-PO Postgres advisory lock (`pg_advisory_xact_lock(hashtext('return:' + poId))`) inside a transaction — without it, two overlapping automation passes could each see "none yet" and both insert (this actually happened in production: 12 POs got duplicate Recall rows + duplicate CN tasks before the lock was added). Returns a `created` flag so the caller only raises a follow-up task once.
- Creating a `RECALL_NOT_DELIVERED` return flips the PO to `RETURNED` and resets `dispatchedQuantity` to 0 on every line (the shipment physically came back, so it needs to read as available stock again for stuck-stock/mapping math). `REJECTED_GRN`/`DAMAGE`/`SHORTAGE` types (post-GRN) are left untouched — different accounting situation.
- Closing a return requires a `rootCause` (enforced, not optional).

---

## 11. PO Mapping — `src/modules/po-mapping/po-mapping.service.ts`

Links a stuck/undelivered PO's leftover stock onto a different, live PO that needs the same SKU(s) — always whole-PO-to-whole-PO, never a lone line.

- **`MIN_NEW_PO_COVERAGE_RATIO = 0.7`** — the *combined* value mapped across all included SKU lines must reach ≥70% of the new PO's total value. All-or-nothing: if the aggregate falls short, or any single line fails its own availability/SKU-match check, nothing is written (atomic transaction).
- Availability per (PO, SKU) = `(quantity − dispatchedQuantity) − sum(already ACTIVE-mapped elsewhere)`.
- `autoMapWholePO`: scans every other live PO, matches overlapping SKUs against the stuck PO's available stock, and picks whichever candidate clears the 70% bar with the *highest* coverage.
- A successful mapping re-derives the originating stuck-stock row's status (`OPEN`/`PARTIALLY_MAPPED`/`MAPPED`) from live ACTIVE mappings — never a hand-advanced field.
- **Reattempt Delivery** (`po.service.ts: reattemptDelivery`) is this same mechanism under a different label: a failed-delivery PO's undelivered lines get cloned onto a brand-new `<poNumber>-R<n>` PO, then mapped via `mapWholePO` (coverage is always ~100% since quantities match exactly). The original PO's status/decision is left alone (stays `RETURNED`) — it resolves only once the new PO's GRN completes, same recovery path as stuck stock.

---

## 12. Location Master classification — `src/modules/locations/locations.service.ts`

- **Fuzzy match** (`classify`): normalizes (lowercase, strip non-alphanumeric) and tries exact match on location name or warehouse code first, then substring containment either direction. Unmatched → caller treats it as `NON_LOCAL` (the safer, longer-buffer default) and should raise `UNKNOWN_WAREHOUSE`.
- Active-locations list cached 15s (invalidated on any write) — `classify()` is called per row during bulk import, so a full remote-table scan per row was the actual cost being avoided.
- **Pending Location queue**: an unmatched warehouse name is queued once; repeat sightings just bump `occurrenceCount` on the still-`PENDING` row rather than creating duplicates.
- **Approval** auto-resolves every open `UNKNOWN_WAREHOUSE` exception for that same (normalized) name across every batch that hit it — the root cause is fixed, so the backlog clears with it rather than sitting open waiting for manual cleanup. Bulk approval derives a unique warehouse code from the name (`A-Z0-9` + dash, numeric suffix on collision).

---

## 13. System Settings / Config — `src/modules/config/config.service.ts`

- Admin-editable Risk Thresholds (black/red/orange/yellow day counts), 60s in-memory cache, defaults `{black:1, red:2, orange:4, yellow:7}`.
- Update validates: all four must be non-negative integers, and strictly ascending (`black < red < orange < yellow`). Writes an `AuditLogEntity` row (old/new JSON) before applying.
- SLA Thresholds shown on the same Settings page (appointment reminder/escalation hours, GRN ageing bands, AVV follow-up days, appointment extension window) are **currently display-only** — they're hardcoded constants inside `automation.service.ts`'s cron jobs (§7), not read from this config. Changing the numbers on the page does nothing until/unless that wiring is added.

---

## 14. Bulk Import pipeline — `src/modules/bulk-import/`

Clean → dedup → compile → reconcile, one pass per uploaded row, run as a background job (never inline on the HTTP request — see `BackgroundImportRunner` pattern in `CLAUDE.md`).

**Duplicate Detection** (`duplicate-detection.service.ts`) — row identity = `platform :: PO Number :: SKU :: Warehouse`:
- No matching PO → `NEW`.
- PO exists, no matching line item → `NEW` (new SKU on an existing PO).
- Line exists: compares ordered/accepted/dispatched/delivered/rejected qty + appointment date. All identical → `EXACT_DUPLICATE`. Any different → `UPDATED`.
- Also `EXACT_DUPLICATE` if the exact same identity key already appeared earlier in *this same file* (`seenInBatch`), regardless of what's in the DB.
- Missing PO number or SKU → `POSSIBLE_DUPLICATE` (can't reliably classify, flagged for manual review).

Reconciliation Engine (§6) then runs per processed row to catch quantity/value/MRP drift. `ExceptionsService` is the shared sink every exception type across the app lands in (quantity/value/MRP mismatch, unknown warehouse, possible duplicate), with resolution tracked per exception.

The same five-stage shape (batch entity → row entities → background queue → periodic progress flush → stalled-batch detection) is reused nearly verbatim for `invoice-import`, `grn-import`, `prn-import`, `dn-import`, `dispatch-report-import` — see `CLAUDE.md`'s "Bulk upload / import modules" section for the shared conventions; this file doesn't repeat per-type specifics where they're identical.

**Invoice Bulk Upload PDF path** (`invoice-import.service.ts: parsePdf`) — the one importer that also accepts a non-spreadsheet source: Vasy ERP's GST invoice PDF export (no spreadsheet register exists for it). A single PDF commonly bundles many invoices; rows are grouped by `Invoice No.` across its repeated page headers, and each page's PO Number / Net Amount / Invoice Date is paired to the nearest `Invoice No.` occurrence (backward for fields that follow it in the text, forward for Invoice Date — this template's pdf.js text order puts a page's date value just before its own `Invoice No.` line). Feeds into the same `resolvePo`/`matchAndApply` logic the spreadsheet path uses, so a failed PO extraction still gets the existing invoice-number fallback. No AWB is extracted from this source by design (`Vehicle No.` on these invoices isn't a courier AWB).

---

## 15. Sheet Tracker two-way sync — `src/modules/sheet-tracker-import/sheet-tracker-import.service.ts`

Applies edits made directly on the live "Master Dispatch & GRN Tracker" Google Sheet back onto the app's PO records (`syncFromGrid`), and separately exposes a read-only full-data export (`getFullPoDataForSheet`, powers the "ALL PO DATA" sheet — see `CLAUDE.md` 2026-10-26 (2) entry).

- Column matching is alias-based (`ALIASES` map) and header-driven, not positional — the sheet's columns can be reordered/renamed within reason and still resolve, but if none of a required field's aliases are found at all, the whole sync is rejected up front (nothing partially applied) rather than silently skipping that field.
- GRN values on the sheet are applied net of some adjustment (`applyGrn` computes a net figure) rather than as a raw overwrite.
- Deleting an import batch record never undoes what it already applied to POs — it only removes the upload's own audit trail.

---

## 16. PO Edits — `src/modules/po/po.service.ts`

- **`diffAndApply`** (used by `editPO`): "everything is editable, nothing silently overwritten." Only fields actually present (not `undefined`) in the incoming payload are considered; a field explicitly set to `null` clears the value and is still recorded as a change. Numeric-looking old/new values are compared numerically (so a resubmitted `"200.00"` string from a decimal column vs. a submitted `200` number isn't flagged as a false diff). Every real change is written to `POChangeHistoryEntity`.
- **`recomputePOAggregates`** (after every edit): per line — `pendingQuantity = max(qty − dispatched, 0)`, `lineValue = qty × price` (price = `unitPrice`, falling back to `mrp` only when no unit price exists at all — MRP is consumer-facing and would badly inflate commercial value if used by default), `fulfilmentPercent`/`pendingPercent` from dispatched/qty. Availability per line: `AVAILABLE` if `availableQty ≥ qty`, `SHORT` if `0 < availableQty < qty`, else `NOT_AVAILABLE`. PO-level `poValue` is only overwritten once at least one line has real pricing data — a manually-typed `poValue` with no per-line pricing is left alone. `isLowPoValue = poValue < 5000` (`LOW_PO_VALUE_THRESHOLD`, `packages/shared/src/index.ts`).
- **Non-fulfilment diagnosis** (`buildNonFulfilmentDiagnosis`): a deterministic, data-driven explanation generated from what the system can already see — days to/past expiry, % dispatched, stock-value coverage, low-value flag, appointment confirmation/SLA, dispatch plan status, open exception count/types — shown before a human commits to marking a PO `NOT_FULFILLED`, and snapshotted onto the PO at the moment of that decision (`nonFulfilmentSystemRemarks`), separate from the human's own free-text remarks.
- Marking `NOT_FULFILLED` requires a reason from the enum, and `OTHER` additionally requires non-empty remarks — enforced, not just UI-suggested. The system's own auto-mark (`markNotFulfilledBySystem`) is a no-op if already `NOT_FULFILLED`, and never overrides an existing human decision.
- **`recordGRN`**: outcome `MATCHED` needs nothing else; any other outcome requires a `discrepancyReason`. `NO_GRN` → opens a `REJECTED_GRN` return + `RETURN_CN` task. Any other non-`MATCHED` outcome → opens a `DISCREPANCY` task (5-day SLA). Any outcome triggers `POMappingService.recoverMappingsForNewPo` — physical arrival, not the mapping creation itself, is what counts as "recovered" for stuck stock.
- **Inventory rollup** (`getInventoryRollup`): SKU-level aggregation across every live (non-binned) PO — there's no separate warehouse-stock table, so "inventory" here is purely the ordered/dispatched/available/pending picture line items already carry. Grouped by `skuCode` (not display name, since the same product can carry slightly different names across source files); the display name/UPC shown per SKU is whichever name/UPC pairing has the highest cumulative units, not just the first one seen.

---

## 17. Access control — `src/common/guards/`, `src/common/decorators/roles.decorator.ts`

- Every endpoint requires a valid JWT (`AuthGuard('jwt')`) by default.
- `@Roles(...)` + `RolesGuard` is additive, route-by-route: no `@Roles` decorator = any authenticated user; with it, the request's `user.roles` array must intersect the required role list or it's rejected with 403. Currently gates: Risk Threshold edits (`ADMIN` only) and other explicitly marked admin actions.

---

## Known gaps / things this sheet deliberately does NOT claim

- **SLA Thresholds on the Settings page are cosmetic** — see §13. If asked "why didn't changing the GRN ageing hours do anything", this is why.
- **Fulfilment Status (§5) and Risk Status (§2) are two independent color systems** shown side by side on different views — don't conflate a RED fulfilment tile with a RED risk tile; they answer different questions (quantity/appointment health vs. expiry urgency).
- `DispatchPlanningEngine` (§4) and `LocationDispatchEngine` (§3) sound similar and both produce a "dispatch date" — only §3's output is live/authoritative on the PO screen; §4 only ever seeds the initial Dispatch row at creation time.
