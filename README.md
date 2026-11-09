# Lead Manager

Replaces the Google Sheet for the sales team. It keeps every lead and its full
history, shows what is due today, scores priority automatically, makes WhatsApp
follow-ups fast, and reports on sources, losses and conversion.

This is the existing CRM codebase updated in place, running on React + Vite +
Hono + Cloudflare Workers/D1. Locally it runs on one laptop at
**http://localhost:5173** — no Flask app.

## Your data is loaded

The workspace has been migrated from `QT-Leads-WhatsAPP.xlsx`:

| | |
| --- | --- |
| Leads | **354** (`QT-001` … `QT-354`) |
| Timeline entries | **3,099** |
| Open follow-ups | **207** |
| Dated meetings | **19** |
| WhatsApp / call scripts | **46** |
| Closed lost | **115**, each with a loss reason |
| Open pipeline | **239** |
| Overdue follow-ups | **160**, due today **17** |

The seven empty rows (`QT-355` … `QT-361`) were skipped. The original
`FollowUps_Internal` sheet was a filtered view of the same `Next Follow-Up`
dates, so it was not duplicated. `Logger` (script errors) was ignored. `Sheet1`
scratch notes were merged only where they added something new. `Settings` was
used for the status/source vocabulary. See
[docs/status-mapping.md](docs/status-mapping.md) for every mapping decision and
[docs/data-coverage.md](docs/data-coverage.md) for a column-by-column audit.

## Run it

```sh
npm install     # once
npm run dev     # one command to start
```

`bun install` / `bun run dev` also works if Bun is installed. A fresh, empty
workspace still gets sample data on first open; this workspace already has the
real data and will not be reseeded.

Production build: `npm run build` (static assets + Worker).

## Screens

- **Today** — clickable KPI cards for overdue follow-ups, due today, meetings
  today, pending meetings and quiet high-priority leads. Each card opens only
  that list.
- **Next actions** — one prioritized queue (overdue, today, upcoming), a daily
  wrap-up with meetings done and follow-ups pending, quick capture, and open
  leads that have no next step.
- **Follow-ups** — pending, today, yesterday, tomorrow, previous, overdue,
  upcoming and completed views; custom date; search; KPI cards; client, phone,
  due date and last note on every row; bulk select and reschedule-with-reason;
  complete/reopen actions; “Log” opens today's discussion for that lead. 20 rows
  per page. Completing an open lead requires a next step; closing Won/Lost or
  postponing with a reason is the exception.
- **Data health** — duplicate phone groups, missing numbers, placeholder names,
  quiet high-priority leads and open leads with no follow-up.
- **Leads** — search by name, number, company or QT number; labelled filters for
  status, priority, source, product, company type and follow-up date; active
  filter chips; sort; archive view; 20 rows per page with numbered pages.
- **Meetings** — total/today/yesterday/tomorrow/pending/completed KPIs; all,
  previous, pending, today, yesterday, tomorrow, upcoming and completed views;
  custom date; search; client phone; status badges; 20 rows per page; status
  selector on every row.
- **Lead detail** — contact and organization, requirement, full interaction
  timeline, follow-ups, meetings, additional contacts, and the most relevant
  WhatsApp scripts filled from the lead. **Add today's discussion** opens the
  full interaction form (channel, outcome, note, status and next follow-up) and
  immediately refreshes the history.
- **Pipeline** — one column per status; drag a card to change status. Dropping
  into Closed Lost asks for the required loss reason.
- **Invoices & quotations** — professional A4 invoice/quotation editor with
  live pricing, editable client and company details, Package 1–10 AI Attendance
  System rates, extra users and branches, custom lines, discount, editable
  16% sales tax, amount in words, UBL bank details, terms and Print / Save PDF.
  The **Pricing & settings** tab updates every plan figure, company/bank details,
  tax defaults, prefixes and terms. Documents keep their own saved tax and
  pricing snapshot.
- **Templates** — all 46 scripts, editable, with placeholders.
- **Import / Export** — CSV import with preview and status mapping; CSV export
  for backups; downloadable mapping document.
- **Reports** — leads by status, by source with conversion, loss reasons,
  conversion rate, and leads by product.
- **Settings → Email briefings** — enable/disable the whole feature, set morning
  and evening times and time zone, save the Gmail SMTP app password (encrypted
  in D1 and never returned to the browser), send a test email, inspect recent
  deliveries, and edit the new-lead and proposal cadences.

## Email briefings

- **Morning** lists today's meetings and today's follow-ups.
- **End of day** shows meetings done vs scheduled and follow-ups completed vs
  still pending, with an overdue count.
- The scheduler reads Settings on every tick, so changes take effect without a
  restart. Sends are logged once per day per owner.
- Local development ticks every minute while `npm run dev` is running; the app
  also heartbeats while a tab is open, and the Worker exports a scheduled
  handler for hosts that support cron.
- Enter the Google app password once in **Settings → Email briefings**. It is
  encrypted before storage and is never shown again. Alternatively set
  `SMTP_PASSWORD` in an untracked `.dev.vars`.

## What was normalised

- **Statuses** map to the agreed 10-stage pipeline. `Price High` → Proposal
  Sent; `Demo Trail` → Demo Done; `Not Responding`, `Call Attempted` and
  `1st Message` → Contacted; `Immature Lead` / `On Hold` → Postponed;
  `Under Review` → Proposal Sent; `Not Interested` / `Not relevant` → Closed
  Lost with a reason.
- **B2B** is a flag (+15 priority), not a status. The 11 old `B2B` leads are
  New with the flag set.
- **Sources**: `Meta Ads(%40)` and `Meta Ads(40%)` become `Meta Ads (40%)`;
  `Whats App` becomes `WhatsApp`. `Meta Ads` is kept separate from
  `Meta Ads (40%)`.
- **Products** are grouped into AI Attendance System, GPS Tracking, HR /
  Payroll and AI Chatbot. The exact original requirement text is preserved in
  the lead's requirement.
- **Phones** are stored in +92 format; multiple numbers and POC numbers become
  additional contacts.
- **Loss reasons** use the app's reporting categories; the original objection
  text is kept on the lead. Only two old lost rows had no inferable reason and
  are tagged Other.
- **Priority** is recalculated from status, B2B, headcount, overdue follow-up
  and last activity. The old sheet's static Priority Score/Level is not kept,
  because the app always derives it.
- **Headcount** was extracted only where the notes explicitly said staff or
  employees (for example "35 Staff", "10 Employees"); student/member/campus
  counts were not treated as headcount.
- **Assigned To** is `Imran`, since the source sheet's column was blank.
- **History:** all 3,080 rows from the History sheet are kept as timeline
  entries, including blank-note status changes; each row's historical next
  follow-up date is recorded in its note.
- **Meeting** free text that had no date is preserved in the lead history;
  dated values and time-only values (combined with their History date) became
  meeting records.

## WhatsApp and call scripts

The 46 unique scripts from `Queries` are in **Templates**. Placeholders include
`[Name]`, `[Company Name]`, `[Company/School Name]`, `[Restaurant Name]`,
`[Product]`, `[City]`, `[Organization Type]`, `[Lead ID]`, `[Designation]` and
`[My Name]`. A lead panel shows up to 8 relevant scripts (product/segment
matched, no call guides, no restaurant scripts for non-restaurants); the full
library stays on Templates.

## Importing the sheet again

The repeatable migration is `scripts/import_qt_workbook.py`:

```sh
python scripts/import_qt_workbook.py          # dry run: counts + warnings
python scripts/import_qt_workbook.py --live   # replace app data from the xlsx
```

It requires Python 3 with `openpyxl` and the app running on port 5173. It reads
`Master_Leads`, `History`, `Sheet1` and `Queries`, posts the complete backup to
`POST /api/import/backup`, and preserves codes, dates, history, meetings and
templates. New day-to-day leads can still be added through **Add lead** or a
CSV through **Import / Export**.

## Backups

- **Download leads CSV** on the Import / Export screen (or Settings → Data).
- Copy `.wrangler/state/v3/d1` while the dev server is stopped.
- The migration script can dump the full JSON backup with `--dump backup.json`.

**Settings → Data → Clear workspace** deletes all leads and leaves the workspace
empty; it no longer restores sample data.

## Business rules

- Every status change writes an interaction automatically.
- Closed Lost cannot be saved without a loss reason.
- Closed Won / Closed Lost clear open follow-ups.
- Logging an interaction asks for the next follow-up date; the default is +2 days.
- Phone duplicates are detected by the last 10 digits and blocked unless you
  choose "Save anyway".
- For a lead postponed for a personal or family reason, pricing and discount
  templates are hidden.
- Priority: status base score plus B2B +15, headcount over 500 +10, overdue
  follow-up +5, no activity for 14+ days −10, capped at 100. Levels: High 80+,
  Medium-High 60–79, Medium 40–59, Low 30–39, Very Low 1–29, Inactive 0.
- Dates are displayed as DD-MMM-YYYY.

## Where things are

- `src/shared/leads.ts` — statuses, scoring, phone rules, placeholders, legacy
  status mapping.
- `src/worker/routes/leads.ts` — lead list, create, edit, archive.
- `src/worker/routes/lead-activity.ts` — interactions, follow-ups, meetings,
  contacts.
- `src/worker/routes/lead-backup.ts` — full backup restore used by the migration.
- `src/worker/routes/invoices.ts` — invoice/quotation CRUD, numbering and
  server-side totals.
- `src/shared/invoice.ts` — default pricing plan, bank/company defaults, tax and
  totals calculations, amount in words and pricing line builder.
- `src/worker/routes/insights.ts` — today, reports, search, CSV import/export.
- `scripts/import_qt_workbook.py` — the workbook migration.
- `docs/status-mapping.md` — old status → new status and open decisions.

The original CRM screens and API routes are still in the repository but are no
longer linked from the navigation.
