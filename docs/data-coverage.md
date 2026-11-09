# Data coverage — QT-Leads-WhatsAPP.xlsx

Source: `QT-Leads-WhatsAPP.xlsx`, imported into the local D1 database.

## Totals currently in the app

| Record | Count |
| --- | ---: |
| Leads (`QT-001`–`QT-354`) | 354 |
| Organizations | 354 |
| Contacts (primary + POC) | 372 |
| Requirements | 354 |
| History / timeline entries | 3,099 |
| Open / historical follow-ups | 207 |
| Dated meetings | 19 (all `Scheduled`) |
| WhatsApp and call templates | 46 |

The **3,099** timeline entries contain all **3,080 History rows**, plus additional
Master notes and last notes that were not already present, plus 5 scratch-sheet
notes. No History row was dropped.

## Master_Leads — all 23 named columns

| Column | Where it went |
| --- | --- |
| Lead ID | `leads.lead_code` (kept exactly) |
| Date Added | `leads.created_date` |
| Company Name | `organizations.name` |
| Company Type | `organizations.type` (blank stays blank) |
| Contact Person | primary `lead_contacts.full_name` |
| Contact No | primary `lead_contacts.phone_number` (normalised to +92) |
| POC | additional contact / designation when present |
| POC Name | additional contact |
| Requirement | `requirements.summary` (original wording kept) |
| Notes | timeline entry, when present |
| Details Gathered | `requirements.details` and headcount when explicit |
| Lead Source | `leads.lead_source` (normalised, e.g. `Meta Ads(%40)` → `Meta Ads (40%)`) |
| Current Status | `leads.status` (mapped to the 10-stage pipeline) |
| Last Updated | `leads.updated_at` / last activity timestamp |
| Last Note | timeline entry; skipped only when already in History |
| Objection | `requirements.objection_type` plus timeline detail |
| Next Follow-Up | open `follow_ups` row (closed leads have none) |
| Assigned To | `leads.assigned_to`; the sheet was blank, so `Imran` |
| Remarks | `requirements.internal_remarks` / timeline |
| Meeting | dated values became meetings with status `Scheduled`; undated text stayed in remarks |
| Priority Score | **not copied** — priority is recalculated by the app |
| Priority Level | **not copied** — recalculated from status, B2B, headcount, overdue and inactivity |
| Follow-Up Source | `follow_ups.creation_mode` (Auto / Manual) |
| Columns 24–31 | empty in the workbook |

## History — all rows and named columns

| Column | Where it went |
| --- | --- |
| Lead ID | matched to the lead |
| Company Name | not stored separately — already on the organization |
| Date & Time | interaction date |
| Status | `interactions.status_after` (raw status also kept in the note when it differs) |
| Detailed Note | interaction note |
| Objection | appended to the note |
| Remarks | appended to the note |
| Next Follow-Up | written into the historical note as `Next follow-up: DD-MMM-YYYY` |
| Meeting | dated value created a meeting; text stayed in the note |
| Empty columns | ignored |

Every History row becomes a timeline entry, even if its note was blank. The
blank-note rows keep their status as `Status: <raw status>`.

## Other tabs

| Tab | Result |
| --- | --- |
| `Sheet1` | 5 scratch notes merged into matching leads where they added new detail |
| `Queries` | all 46 scripts imported; 9 call guides tagged `Call`; 16 restaurant scripts mapped to their real scenarios |
| `Settings` | used as the vocabulary for statuses, sources, salespeople and company types |
| `FollowUps_Internal` | **not duplicated** — it is the same 207 follow-up dates already in Master |
| `Logger` | **ignored** — script/Apps Script error log, not lead data |

## Known gaps / decisions

1. **QT-072 and QT-320** are “Other” for loss reason because the workbook never
   records a real reason. Their full history is preserved.
2. **QT-006 and QT-013** share a phone and the sheet says they are the same
   person, but both have separate histories, so both were kept. Merge manually
   only after reviewing both.
3. **Undated meeting text** (for example “Meeting schedual tomorrow”) cannot
   become a dated meeting row. It is preserved in the lead’s remarks/timeline.
4. **19 meetings** exist in the sheet: 13 with a full date and 6 with a time
   only (for example `2:00 PM`), which were combined with that History row’s
   date. The sheet has no completion status, so all are `Scheduled`. Their dates
   are in the past, so the Meetings page marks them **Overdue** until you set
   them to Done or Cancelled. Date-only entries show **Time not set** because
   the sheet did not record a time.
5. **Seven empty rows** (`QT-355`–`QT-361`) had no contact and were skipped.
6. **Priority Score/Level** from the sheet are deliberately replaced by the
   app’s live priority rules.
7. **Assigned To** was blank throughout, so every lead is assigned to `Imran`.
