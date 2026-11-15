# PO Control Tower (website)

Static site (GitHub Pages) that reads and writes your Google Sheets through a small Google Apps Script backend.
The Warehouse Master is only ever read. Writes go only to "PO Control Tower - Tracking (app data)" and need the editor PIN.
This repo's code contains no PO data. Data is fetched at runtime and only with the access key.

## One-time setup

1. Open https://script.google.com, New project. Create three files and paste in `apps-script/Code.gs`, `apps-script/Core.gs` and `apps-script/Master.gs` (same names).
2. Project Settings > Script Properties > add `VIEW_KEY` = a long passphrase you choose (share it only with your team).
3. Deploy > New deployment > type Web app > Execute as: Me, Who has access: Anyone > Deploy. Authorize when asked.
   (Your Google account must be able to open both sheets.)
4. Copy the web app URL (ends in /exec) and paste it into `po-tower/config.js`:
   `window.PO_CONFIG={backend:'https://script.google.com/macros/s/XXXX/exec'};` then commit to the `gh-pages` branch.
5. Repo Settings > Pages > Source: Deploy from a branch > `gh-pages` / (root). Site: https://anmolnootie.github.io/nootietracker/po-tower/
6. Open the site, enter the VIEW_KEY once per device. To edit, click Unlock editing and set the editor PIN (first time) or enter it.

If you change Code.gs later: Deploy > Manage deployments > edit > New version.

## Automatic MASTER sheet

`Master.gs` rebuilds the sheet "PO Control Tower - MASTER (all data)" from the Warehouse Master (read only) plus the app's tracking entries, using the same logic as the site.
After deploying, pick the function `setupMasterSync` in the Apps Script editor and click Run once (approve the permissions). It installs a 10-minute timer and runs the first sync immediately.
