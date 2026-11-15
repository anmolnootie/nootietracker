-- Reset all PO / import / activity data so the app can be rebuilt from the Warehouse Master.
-- KEEPS: users, customer / transporter / owner / location masters, SKU master, column mappings,
--        system settings (risk thresholds, Control Tower SLAs) and the migrations history.
-- DELETES: every PO and everything hanging off it (lines, appointments, dispatch, logistics, GRN,
--          returns, tasks, documents' DB rows, tracking, issues, mappings, stuck stock, history),
--          every import batch and row, exceptions, compilations, notifications and the audit log.
--
-- 1. BACK UP FIRST (from any machine with PostgreSQL client tools; use the Session Pooler details):
--    pg_dump "postgresql://<user>:<password>@<host>:5432/postgres?sslmode=require" -n public -Fc -f nootie-before-reset.dump
-- 2. Paste this whole file into Supabase > SQL Editor and run it. It runs as one transaction.
-- 3. Upload the Warehouse Master on Uploads > Warehouse Master.
BEGIN;
TRUNCATE TABLE
  po_master, po_line_items, appointments, dispatch, logistics_trackers, grn_trackers, return_trackers, tasks,
  documents, po_change_history, po_deletion_audit, po_mappings, stuck_stock, exceptions, po_tracking, po_issues,
  compilations, notifications, audit_logs, pending_locations,
  upload_batches, bulk_po_raw_rows, bulk_po_processed_rows,
  invoice_upload_batches, invoice_import_rows, grn_upload_batches, grn_import_rows,
  dispatch_report_upload_batches, dispatch_report_rows, sheet_tracker_upload_batches, sheet_tracker_rows,
  prn_upload_batches, prn_import_rows, dn_upload_batches, dn_import_rows
RESTART IDENTITY CASCADE;
DELETE FROM system_configs WHERE key = 'warehouse_master_import';
COMMIT;
-- Check: every count below should be 0.
SELECT 'po_master' AS t, count(*) FROM po_master UNION ALL SELECT 'upload_batches', count(*) FROM upload_batches UNION ALL SELECT 'sheet_tracker_rows', count(*) FROM sheet_tracker_rows;
