# Old sheet → standard pipeline

This is the mapping used for the real `QT-Leads-WhatsAPP.xlsx` import. The
importer matches case-insensitively after removing punctuation and extra
spaces. Unrecognised values import as **New** and are counted as a warning in
the dry run; the real workbook had no unrecognised values.

| Old status in sheet | New status | Rows now |
| --- | --- | ---: |
| New | New | 23 |
| 1st Message | Contacted | → |
| Call Attempted | Contacted | → |
| Not Responding | Contacted | → |
| Connected | Connected | 21 |
| Interested | Connected | → |
| Follow-up Required / Follow-up pending | Connected | → |
| Demo Scheduled | Demo Scheduled | 8 |
| Demo Done | Demo Done / Trial | 7 |
| Demo Trail | Demo Done / Trial | → |
| Proposal Sent | Proposal Sent | 27 |
| Price High | Proposal Sent | → |
| Under Review / Decision Pending | Proposal Sent | → |
| Negotiation / Negotiation in Progress | Negotiation | 1 |
| Postponed / PostPonded | Postponed / On Hold | 41 |
| On Hold | Postponed / On Hold | → |
| Immature Lead | Postponed / On Hold | → |
| B2B | New **+ B2B flag** | 11 flagged |
| Closed Lost | Closed Lost | 115 total |
| Not Interested / Not Intrested | Closed Lost | → |
| Not relevant | Closed Lost | → |
| Closed Won / Won | Closed Won | 0 in sheet |

The 115 lost leads are split: 81 `Closed Lost`, 25 `Not Interested`, 9
`Not relevant`.

## Loss reasons

Loss reasons are derived from the status plus the row's objection, remarks and
recent history, then stored in the reporting categories:

| Reason | Count |
| --- | ---: |
| No response | 30 |
| No current requirement | 29 |
| Price too high | 26 |
| Chose another system | 20 |
| Wrong lead (job seeker, personal use) | 3 |
| Integration or network issue | 2 |
| Prefers one-time or hardware purchase | 2 |
| Budget not available | 1 |
| Other | 2 |

The original objection/remarks text stays on each lead, so nothing is lost.
`QT-072` and `QT-320` are the two rows with no inferable reason and are tagged
**Other**.

## Other normalisations

- **Source:** `Meta Ads(%40)` and `Meta Ads(40%)` → `Meta Ads (40%)`;
  `Whats App` → `WhatsApp`; blank/Pending → `Other`. `Meta Ads` remains a
  separate source (50 leads) from `Meta Ads (40%)` (269 leads).
- **Product:** grouped into AI Attendance System (338), HR / Payroll (5), GPS
  Tracking (4), AI Chatbot (2), Other (1), blank (4). Exact old requirement
  text is kept in the requirement field.
- **Headcount:** extracted only from explicit staff/employee counts in the
  notes. Student, member, campus and branch counts were not treated as staff.
- **Duplicates:** `QT-006` and `QT-013` share a phone in the source sheet and
  were kept as two separate leads. New entries still get last-10-digit
  duplicate blocking.
- **Historical tabs:** all 3,080 `History` rows became timeline entries;
  `FollowUps_Internal` is a 207-row live view of the same `Next Follow-Up`
  dates, so those rows are not duplicated. `Logger` is a script error log and
  was ignored.
- **Priority:** recalculated by the app; the sheet's static Priority Score and
  Priority Level are not copied.

## Decisions still open

1. **Meta Ads vs Meta Ads (40%)** — currently separate, as in the sheet.
2. **Assigned To** — set to `Imran` because the sheet's column was blank. It
   can be split between salespeople later.
3. **B2B** — kept as a flag rather than a status. Say if it should instead sit
   in its own pipeline lane.
