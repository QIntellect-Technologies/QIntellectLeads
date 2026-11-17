# phone_key backfill runbook

Run **after midnight UTC** (05:00 PKT), once D1 daily write quotas reset.

## 1. Production (Cloudflare Workers) — `https://qintellectleads.qintellecttechnologies.workers.dev`

Wait for the Cloudflare Workers build from commit `6fea373` to finish (~1-2 min after push), then:

```bash
BASE=https://qintellectleads.qintellecttechnologies.workers.dev
# log in
curl -s -c /tmp/p.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  -d '{"email":"admin@qintellecttechnologies.com","password":"admin123"}'
# backfill (idempotent; only touches NULL/empty rows)
curl -s -b /tmp/p.txt -X POST "$BASE/api/admin/backfill-phone-keys" \
  -H "Origin: $BASE"
# expect: {"scanned":N,"updated":N,"remaining":0}
```

## 2. Sites preview — `https://qintellect-leads-e50lcc-preview.freebuff.page`

The site is **paused** until the daily write quota resets. After it unpauses:

```bash
BASE=https://qintellect-leads-e50lcc-preview.freebuff.page
curl -s -c /tmp/s.txt -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  -d '{"email":"admin@qintellecttechnologies.com","password":"admin123"}'
curl -s -b /tmp/s.txt -X POST "$BASE/api/admin/backfill-phone-keys" \
  -H "Origin: $BASE"
```

NOTE: the backfill endpoint was added in commit 6fea373, which has NOT yet been deployed to Sites. Before calling it, redeploy:
```bash
cd <project>
npm run build
# then sites_deploy (preview) with a fresh requestId, or use the Freebuff UI
```

## 3. Cleanup (after both backfills report `remaining: 0`)

Remove the temporary endpoint from `src/worker/index.ts`:
- Delete the `/api/admin/backfill-phone-keys` route block.
- Remove the `import { phoneKey } from '../shared/leads'` line.
- Run `npx tsc --noEmit && npm run build`, commit, push.
- For Sites: rebuild + `sites_deploy` to the preview environment.

## Verify

After backfill, duplicate detection should use the indexed `phone_key` column. Confirm by checking Cloudflare D1 / Sites metrics: row reads on lead-save should drop, and `SELECT COUNT(*) FROM lead_contacts WHERE phone_key IS NULL` should be 0.
