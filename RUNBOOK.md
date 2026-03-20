# Incident Investigation Runbook

When you get an alert email or a user reports a problem,
follow this exact process to diagnose and fix it quickly.

---

## STEP 1 — IDENTIFY THE EXACT ERROR (2 minutes)

Go to **Logs Explorer → "All Errors Today" bookmark**
Filter by the time the user said the problem occurred
Look for `ERROR` entries around that time

Read the log entry:
- **`event`** — what happened (`FILE_UPLOAD_FAILED`, `ZARA_ERROR`, etc.)
- **`error`** — the actual error message
- **`route`** — which API endpoint
- **`userId`** — who experienced it

---

## STEP 2 — CLASSIFY THE ERROR TYPE (1 minute)

### Category A — Configuration error (env variable missing/wrong)
**Signs:** `"GEMINI_API_KEY not configured"`, `"DATABASE_URL missing"`,
`"R2 bucket not found"`, `"RESEND_API_KEY invalid"`

**Fix:** Update environment variable in Cloud Run → redeploy

### Category B — Database error (query failed)
**Signs:** Prisma error codes (`P2025` not found, `P2002` duplicate, `P2003` FK)

**Fix:** Check the query logic, may need a migration

### Category C — R2 storage error (upload/download failed)
**Signs:** `"403 Forbidden"`, `"URL expired"`, `"bucket not accessible"`

**Fix:** Check R2 credentials, check presigned URL expiry times

### Category D — External API error (Gemini, Resend)
**Signs:** `"fetch failed"`, `"QUOTA_EXCEEDED"`, `"API_KEY_INVALID"`

**Fix:** Check the external service status, update API key if needed

### Category E — Application logic error (bug in code)
**Signs:** `"Cannot read properties of undefined"`, `"TypeError"`,
unexpected `null`/`undefined` values

**Fix:** Identify the route, find the bug, fix and redeploy

### Category F — Performance issue (slow queries)
**Signs:** `SLOW_OPERATION` events with `duration > 3000ms`

**Fix:** Add database index, optimise the query, add caching

---

## STEP 3 — CHECK IF IT IS AFFECTING MULTIPLE USERS

In Logs Explorer, filter the same error event by time range:

```
jsonPayload.event="FILE_UPLOAD_FAILED"
timestamp>="2026-03-15T09:00:00Z"
```

Count how many unique `userId` values appear in the results.

| Unique users | Urgency |
|---|---|
| 1 user | Likely an edge case — lower urgency |
| 3+ users | Systemic problem — fix immediately |
| All users | Critical outage — fix right now |

You can also run the automated diagnosis script:

```bash
bash scripts/diagnose-incident.sh
# or for a specific event:
bash scripts/diagnose-incident.sh --event FILE_UPLOAD_FAILED
```

---

## STEP 4 — FIX AND DEPLOY

### Category A — Configuration errors

```
Cloud Run → Edit & Deploy New Revision → Variables & Secrets
Update the variable → Deploy
```

No code change needed — takes ~3 minutes.

### Categories B, C, E — Code errors

```bash
# Fix the code locally, then deploy:
gcloud run deploy christhood-cmms --source . --region us-central1

# Verify the error stops appearing in Logs Explorer
```

### Category D — External API errors

Check the relevant status page first:

| Service | Status page |
|---|---|
| Gemini | https://status.cloud.google.com |
| Resend | https://status.resend.com |
| Neon | https://status.neon.tech |
| Cloudflare | https://cloudflarestatus.com |

- **Their outage** → wait it out, nothing to do on your end
- **Your config** → update the API key or credentials in Cloud Run

---

## STEP 5 — VERIFY THE FIX

After deploying, go back to **Logs Explorer** and search for the same
error event in the last 10 minutes.

- **No new occurrences** → fix worked ✅
- **Still occurring** → the fix did not address the root cause — investigate deeper

---

## STEP 6 — COMMUNICATE TO THE TEAM (if needed)

**After fixing a user-facing error:**

> "We noticed some uploads were failing earlier — this has been fixed.
> If you experienced any issues, please try again. Your data is safe."

**Before planned maintenance/deployments:**

> "We will be updating the platform briefly in the next 10 minutes.
> If you see any brief interruptions, it will be back in a moment."

---

## Quick Reference

| Resource | Link |
|---|---|
| Logs Explorer | https://console.cloud.google.com/logs/query?project=dotted-spot-476513-i2 |
| Cloud Run | https://console.cloud.google.com/run?project=dotted-spot-476513-i2 |
| Monitoring | https://console.cloud.google.com/monitoring?project=dotted-spot-476513-i2 |
| Neon DB | https://console.neon.tech |
| Cloudflare R2 | https://dash.cloudflare.com |

---

# Deployment Runbook

Every time you fix a bug or add a feature, follow this deployment process.
Cloud Run supports zero-downtime deployments — users never experience
a gap in service when you push an update.

## How Cloud Run Deployments Work

1. You push a new revision
2. Cloud Run starts the new revision alongside the old one
3. Traffic shifts to the new revision (instantly by default)
4. Old revision stays on standby for rollback
5. If the new revision is unhealthy: Cloud Run automatically rolls back

---

## Before Deploying

```
□ Review your code changes — what exactly changed?
□ Check if any database schema changes are needed (Prisma migration)
□ Check if any environment variables need updating
□ Check current error rate in Cloud Monitoring — is the system healthy now?
  (do not deploy on top of an existing incident)
```

---

## STEP 1 — Run Database Migration (if needed)

If you changed `prisma/schema.prisma`, run the migration **before** deploying:

```bash
DATABASE_URL="your-neon-connection-string" npx prisma migrate deploy
```

> ⚠️ Only use `prisma migrate deploy` in production — never `prisma migrate dev`
> (dev can cause data loss). This applies existing migrations safely.

---

## STEP 2 — Deploy the New Code

```bash
gcloud run deploy christhood-cmms \
  --source . \
  --region us-central1 \
  --project dotted-spot-476513-i2
```

This builds a new container, pushes it to Cloud Run, and starts routing traffic.
Takes 2–4 minutes.

---

## STEP 3 — Verify the Deployment

**1. Cloud Run → Revisions tab**
New revision should show: green checkmark, serving 100% traffic

**2. Check logs for the first 2 minutes**
- Should see: normal `API_REQUEST` info logs
- Should NOT see: sudden spike in `ERROR` logs

**3. Test the health check**
```bash
curl https://cmmschristhood.org/api/assistant/health
# Expected: 200 OK
```

**4.** Open the app in your browser and test the specific thing you fixed.

---

## STEP 4 — Rollback If Something Is Wrong

If errors spike after deployment:

**Via Console:** Cloud Run → Revisions tab → click the previous revision → "Send all traffic here" (~30 seconds)

**Via CLI:**
```bash
gcloud run services update-traffic christhood-cmms \
  --to-revisions=PREVIOUS_REVISION_NAME=100 \
  --region us-central1
```

---

## Deployment Timing Guidelines

- **Always deploy fixes promptly** when users are experiencing errors
- **Batch small non-urgent improvements** — avoid deploying 5 times in one day
- **Avoid Saturday morning** (fellowship upload day) — deploy Friday evening or Saturday afternoon instead
- **Check team activity** — if many people are actively uploading, wait for a quiet moment

---

## Environment Variables — Rotation Guide

| Variable | Expires? | Notes |
|---|---|---|
| `GEMINI_API_KEY` | No | Rotate if compromised |
| `RESEND_API_KEY` | No | Rotate if compromised |
| `NEXTAUTH_SECRET` | Never change | Invalidates all active sessions |
| `CLOUDFLARE_R2_*` | No | Rotate if compromised |
| `DATABASE_URL` / `DIRECT_URL` | No | Changes only if DB is reset |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Never change | Breaks all existing push subscriptions |
| `CRON_SECRET` | Rotate periodically | Update Cloud Scheduler job too when changed |
