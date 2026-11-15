# Prompts to paste into Claude Code (VS Code), in order
Run each in a fresh session, one at a time. Wait for the PR before the next.

## 0. Orientation (paste first)
Read CLAUDE.md and docs/control-tower/SPEC.md. Then read docs/control-tower/reference/core.js fully. Do not change any code yet. Summarise: (a) which spec features already exist in this app, (b) which entities/columns are missing, (c) a PR-by-PR plan. Wait for my approval.

## 1. Logic service + period filter
Create a feature branch off main. Port reference/core.js (derive, stage/flag engine, journey funnel, SLA config) into a backend service with unit tests; SLA values come from the existing SystemConfig (add keys, admin-editable). Add GET endpoints: /control-tower/summary?from&to&platform and /control-tower/journey?from&to&platform. Period rule: a PO counts if its PO date is within range; undated POs only when no range. Boot-test the real AppModule on a scratch DB clone, open a PR, do not merge.

## 2. Pipeline page
On a new branch, build the Pipeline page in the frontend from reference/v3.js (v_pipeline): 8-step funnel with counts and values, clickable gap pills that open the PO register filtered to that gap, six status boards, and the open-PO kanban. Period bar with chips FY/90d/30d/7d/Month/Last month/All/Custom; Custom needs an Apply button. Use the brand colours in reference/style.css. Verify numbers against the acceptance numbers in SPEC.md and explain any difference.

## 3. Missing fields + PO journey drawer
New branch: add migration + entity fields for E-way bill no., handed-to person, warehouse ack by, printout received on, owner (check what exists first; register entities in database.module.ts). Add them to the PO edit form and API. Build the PO journey drawer (reference/v3.js poSteps) showing every invoice of a PO, AWB, delivery, GRN, shortage/damage/excess, credit note.

## 4. Per-platform towers
New branch: Overall control tower plus one per platform, each with work list, register, kanban and the period filter, using platform logos. Reuse the services from step 1.

## 5. Issues CRM + audit trail
New branch: issues against a PO (type, priority, status, assignee, next action date, resolve) and an audit log of every change, using the existing audit_logs and auth roles (editor can write, others view).

## 6. Finish
Update CLAUDE.md Project Log with what shipped and where; list anything not ported and why. Open a final PR.
