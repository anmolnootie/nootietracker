# Control Tower feature spec (ported from the Claude artifact "PO Control Tower")

Goal: bring every feature of the standalone artifact into this app (NestJS + Postgres + Next.js).
The artifact is a single-page prototype backed by Google Sheets. `reference/` holds its real source. **It is a spec to read, not code to paste.**
Rebuild each feature on this stack: Postgres tables instead of Sheets, existing login/roles instead of the PIN, existing entities wherever they already hold the data.

## Reference files (read these for exact logic)
| File | What it holds |
|---|---|
| `reference/core.js` | ALL business logic, no DOM: parsers, `derive()` (stage + flag per PO), `journey()` funnel, STAGES, FLAGS, JSTEPS, DEFAULT_CFG (SLA days) |
| `reference/store.js` | Data model: tracking columns, write queue, how entries are stored |
| `reference/v3.js` | Pipeline page (funnel, gap pills, status boards, kanban), period bar, PO journey drawer |
| `reference/ui.js`, `shell.js`, `actions.js` | Pages, tables, forms, drawers, actions |
| `reference/style.css` | Brand look (orange #e8591a, yellow #f6a21e, cream #faf6f1) |

## Features to port
1. **Period filter** (global, top bar): chips FY (from 2026-04-01), 90d, 30d, 7d, Month, Last month, All, Custom. Custom shows From/To plus an **Apply** button; nothing refreshes until Apply. A PO is in range if its PO date is within the range; undated POs appear only under All.
2. **Pipeline (funnel)**, 8 steps: Received, Accepted, Handed to warehouse, Warehouse acknowledged, Invoiced, Dispatched, Delivered, GRN done. A later step implies the earlier ones (see `journeyOf`). Each step shows count and value. Clickable **gap pills** between steps (e.g. not accepted, accepted not handed, dispatched not delivered, delivered without GRN) open the PO register filtered to that gap.
3. **Status boards**: dispatch status, GRN status, returns and credit notes (RTO, CN raised, CN pending), short/damaged/excess, E-way bill (recorded vs needed), printouts.
4. **Stage + flag engine** per PO: 9 stages and 10 flags (see STAGES/FLAGS in core.js) driven by SLA settings (sla_decision 1, sla_handover 1, sla_ack 1, sla_dispatch 3, expiry_warn 3, sla_transit 7, sla_grn 7, legacy_days 30, cn_days 60 days), admin-editable.
5. **Control towers**: Overall plus one per platform (Blinkit, Zepto, Swiggy Instamart, BigBasket, Flipkart, Amazon, Supertails, FirstClub...), each with its own work list, kanban of open POs, and register. Platform logos on tiles.
6. **PO journey drawer**: one PO's full timeline with invoices, AWB, delivery, GRN no/date/amount, shortage/damage/excess, credit note.
7. **Team entry fields per PO**: decision (+reason), printout received on, handed to warehouse on and **to which person**, warehouse ack on/by, owner, remarks, **E-way bill no.** (the Warehouse Master has no E-way column, so it is entered by the team).
8. **Issues CRM**: raise/assign/resolve issues against a PO (types, priority, status, next action date).
9. **Audit trail**: every change logged (who, when, what).
10. **Roles**: one person can edit, others view only. Use this app's existing auth and roles instead of the artifact's PIN.
11. **MASTER ledger**: one row per PO with everything combined (a Sheet export of the DB is enough; optional here since the DB is the master).

## Data mapping (check existing entities first, add only what is missing)
- PO, line items, appointments, dispatch/invoice, GRN, logistics tracker already exist. Reuse them.
- Likely new columns: E-way bill no., handed-to person, warehouse ack by, printout received on, owner. Verify against entities before adding; add via a migration and register any new entity in `database.module.ts` ENTITIES.
- Known gap already in CLAUDE.md: dispatch holds one invoice per PO. The funnel needs every invoice of a split PO.

## Rules for the port
- Work on a feature branch, one PR per feature. Never push straight to `main` (it deploys to production).
- Follow CLAUDE.md conventions: migrations, ENTITIES, timezone utilities, boot-test the real AppModule against a scratch DB before pushing.
- Preserve the logic in `core.js` exactly (stage numbers, flag priority order, the "later step implies earlier" rule); port it to a backend service with unit tests using the numbers below.

## Acceptance numbers (artifact run on the Warehouse Master, 2026-11-15)
3,588 POs; 2,865 invoices; 2,843 POs dispatched. Funnel (all time): received 3,588, accepted 2,887, handed 2,843, acked 2,843, invoiced 2,843, dispatched 2,843, delivered 2,528, GRN done 2,285. Gaps: 622 not accepted, 44 accepted but not handed, 315 dispatched not delivered, 243 delivered without GRN. RTO 185 shipments. Your DB may differ slightly; investigate differences, do not force them.
