#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# diagnose-incident.sh
#
# Automates Steps 1–3 of the CMMS incident investigation workflow:
#   1. Pull recent ERROR log entries from Cloud Logging
#   2. Classify the error category (A–F)
#   3. Count unique affected users
#
# Usage:
#   bash scripts/diagnose-incident.sh
#   bash scripts/diagnose-incident.sh --event FILE_UPLOAD_FAILED
#   bash scripts/diagnose-incident.sh --since "2026-03-20T08:00:00Z"
#   bash scripts/diagnose-incident.sh --event ZARA_ERROR --since "2026-03-20T09:00:00Z" --until "2026-03-20T10:00:00Z"
#
# Options:
#   --event  <EVENT_NAME>   Filter to a specific jsonPayload.event value
#   --since  <RFC3339>      Start of time window (default: 1 hour ago)
#   --until  <RFC3339>      End of time window   (default: now)
#   --limit  <N>            Max log entries to fetch (default: 50)
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project dotted-spot-476513-i2
#   python3 (for JSON parsing — included on macOS/Linux by default)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="dotted-spot-476513-i2"
SERVICE="christhood-cmms"
GCLOUD="C:/Program Files/Git/usr/bin/env bash" # overridden below
GCLOUD_CMD="gcloud"

# ── Parse arguments ───────────────────────────────────────────────────────────
EVENT_FILTER=""
SINCE=""
UNTIL=""
LIMIT=50

while [[ $# -gt 0 ]]; do
  case "$1" in
    --event) EVENT_FILTER="$2"; shift 2 ;;
    --since) SINCE="$2";         shift 2 ;;
    --until) UNTIL="$2";         shift 2 ;;
    --limit) LIMIT="$2";         shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Default time window: last 60 minutes ──────────────────────────────────────
if [[ -z "$SINCE" ]]; then
  # RFC3339, 60 minutes ago — works on Linux (GNU date) and macOS (BSD date)
  if date --version &>/dev/null 2>&1; then
    SINCE=$(date -u --date="60 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")
  else
    SINCE=$(date -u -v -60M +"%Y-%m-%dT%H:%M:%SZ")
  fi
fi

TMPDIR_INC="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_INC"' EXIT
LOG_FILE="${TMPDIR_INC}/entries.json"

# ── Build log filter ──────────────────────────────────────────────────────────
FILTER='resource.type="cloud_run_revision" resource.labels.service_name="'"$SERVICE"'" severity>=WARNING'
FILTER+=" timestamp>=\"${SINCE}\""
[[ -n "$UNTIL" ]] && FILTER+=" timestamp<=\"${UNTIL}\""
[[ -n "$EVENT_FILTER" ]] && FILTER+=" jsonPayload.event=\"${EVENT_FILTER}\""

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Christhood CMMS — Incident Diagnosis"
echo "═══════════════════════════════════════════════════════"
echo "  Project : $PROJECT_ID / $SERVICE"
echo "  Since   : $SINCE"
[[ -n "$UNTIL" ]]        && echo "  Until   : $UNTIL"
[[ -n "$EVENT_FILTER" ]] && echo "  Event   : $EVENT_FILTER"
echo "  Limit   : $LIMIT entries"
echo ""
echo "==> Fetching logs..."

# ── Fetch logs as JSON ────────────────────────────────────────────────────────
$GCLOUD_CMD logging read "$FILTER" \
  --project="$PROJECT_ID" \
  --limit="$LIMIT" \
  --format="json" \
  --order=desc \
  2>/dev/null > "$LOG_FILE"

ENTRY_COUNT=$(python3 -c "import json; d=json.load(open('${LOG_FILE}')); print(len(d))")

if [[ "$ENTRY_COUNT" == "0" ]]; then
  echo ""
  echo "  ✅  No WARNING/ERROR entries found in this time window."
  echo "  The system appears healthy."
  echo ""
  exit 0
fi

echo "    Found $ENTRY_COUNT entries."
echo ""

# ── Python analysis script ────────────────────────────────────────────────────
python3 << PYEOF
import json, sys, collections

with open("${LOG_FILE}") as f:
    entries = json.load(f)

# ── Classify error categories ─────────────────────────────────────────────────
CATEGORY_RULES = {
    "A — Config":      ["not configured", "missing", "invalid api key", "api_key_invalid",
                        "bucket not found", "environment variable"],
    "B — Database":    ["prisma", "p2025", "p2002", "p2003", "connection", "database",
                        "unique constraint", "foreign key"],
    "C — R2 Storage":  ["r2", "presigned", "forbid", "403", "bucket", "s3", "cloudflare"],
    "D — External API":["fetch failed", "quota_exceeded", "gemini", "resend", "neon",
                        "upstream", "503", "502", "rate limit"],
    "E — App Logic":   ["typeerror", "cannot read", "undefined", "null", "unexpected",
                        "is not a function", "syntaxerror"],
    "F — Performance": ["slow_operation", "timeout", "duration"],
}

def classify(entry):
    payload = entry.get("jsonPayload", {})
    event   = str(payload.get("event", "")).lower()
    error   = str(payload.get("error", "")).lower()
    msg     = str(payload.get("message", "")).lower()
    combined = f"{event} {error} {msg}"
    if "slow_operation" in event:
        return "F — Performance"
    for cat, keywords in CATEGORY_RULES.items():
        if any(k in combined for k in keywords):
            return cat
    return "E — App Logic"

# ── Aggregate stats ───────────────────────────────────────────────────────────
events_counter    = collections.Counter()
category_counter  = collections.Counter()
affected_users    = collections.defaultdict(set)   # event -> set of userIds
routes_counter    = collections.Counter()
errors_seen       = []

for entry in entries:
    payload   = entry.get("jsonPayload", {})
    event     = payload.get("event", "(no event)")
    error     = payload.get("error", "")
    route     = payload.get("route", "")
    user_id   = payload.get("userId", "")
    severity  = entry.get("severity", "")
    timestamp = entry.get("timestamp", "")[:19].replace("T", " ")
    cat       = classify(entry)

    events_counter[event] += 1
    category_counter[cat] += 1
    if route:
        routes_counter[route] += 1
    if user_id:
        affected_users[event].add(user_id)
    if severity == "ERROR":
        errors_seen.append({
            "ts": timestamp, "event": event, "error": error[:80],
            "route": route, "userId": user_id, "cat": cat,
        })

# ── Print: Event breakdown ────────────────────────────────────────────────────
print("┌─────────────────────────────────────────────────────────┐")
print("│  STEP 1 — EVENT BREAKDOWN                               │")
print("└─────────────────────────────────────────────────────────┘")
for event, count in events_counter.most_common(15):
    users = len(affected_users.get(event, set()))
    user_label = f"{users} user{'s' if users != 1 else ''}" if users else "no userId"
    print(f"  {count:>4}x  {event:<40}  [{user_label}]")
print()

# ── Print: Category summary ───────────────────────────────────────────────────
CATEGORY_DESCRIPTIONS = {
    "A — Config":      "Env variable missing / wrong key",
    "B — Database":    "Prisma / DB query failure",
    "C — R2 Storage":  "Cloudflare R2 upload or download problem",
    "D — External API":"Gemini / Resend / Neon external service",
    "E — App Logic":   "Bug in application code",
    "F — Performance": "Slow queries / timeouts (>3 s)",
}
print("┌─────────────────────────────────────────────────────────┐")
print("│  STEP 2 — ERROR CATEGORIES                              │")
print("└─────────────────────────────────────────────────────────┘")
for cat, count in sorted(category_counter.items()):
    desc = CATEGORY_DESCRIPTIONS.get(cat, "")
    print(f"  {count:>4}x  {cat}  →  {desc}")
print()

# ── Print: Affected users per event ──────────────────────────────────────────
print("┌─────────────────────────────────────────────────────────┐")
print("│  STEP 3 — AFFECTED USERS                                │")
print("└─────────────────────────────────────────────────────────┘")
any_users = False
for event, users in affected_users.items():
    if users:
        any_users = True
        urgency = "🔴 HIGH" if len(users) >= 3 else ("🟡 MEDIUM" if len(users) >= 1 else "⚪ LOW")
        print(f"  {event}")
        print(f"    {len(users)} affected user(s)  →  {urgency}")
        for uid in list(users)[:5]:
            print(f"    · userId: {uid}")
        if len(users) > 5:
            print(f"    · ... and {len(users) - 5} more")
        print()
if not any_users:
    print("  No userId fields found in log entries.")
    print()

# ── Print: Recent ERROR entries (most recent 10) ──────────────────────────────
if errors_seen:
    print("┌─────────────────────────────────────────────────────────┐")
    print("│  RECENT ERROR ENTRIES (newest first)                    │")
    print("└─────────────────────────────────────────────────────────┘")
    for e in errors_seen[:10]:
        print(f"  {e['ts']}  [{e['cat'][:1]}]  {e['event']}")
        if e['route']:
            print(f"    route  : {e['route']}")
        if e['userId']:
            print(f"    userId : {e['userId']}")
        if e['error']:
            print(f"    error  : {e['error']}")
        print()

# ── Print: Fix guide ──────────────────────────────────────────────────────────
top_cats = [c for c, _ in category_counter.most_common(2)]
print("┌─────────────────────────────────────────────────────────┐")
print("│  STEP 4 — RECOMMENDED FIX                               │")
print("└─────────────────────────────────────────────────────────┘")
FIX_GUIDE = {
    "A — Config": (
        "Cloud Run → Edit & Deploy New Revision → Variables & Secrets\n"
        "  Update the env variable → Deploy (no code change needed, ~3 min)"
    ),
    "B — Database": (
        "Check the Prisma error code:\n"
        "  P2025 = record not found   → guard the query with a null check\n"
        "  P2002 = unique violation   → input validation needed\n"
        "  P2003 = foreign key error  → check related record existence\n"
        "  connection error           → check Neon status.neon.tech"
    ),
    "C — R2 Storage": (
        "Check Cloudflare R2 credentials in Cloud Run env vars:\n"
        "  CLOUDFLARE_R2_ACCESS_KEY_ID / CLOUDFLARE_R2_SECRET_ACCESS_KEY\n"
        "  If presigned URL expired: increase TTL in lib/r2.ts\n"
        "  Status: cloudflarestatus.com"
    ),
    "D — External API": (
        "Check external service status first:\n"
        "  Gemini  → status.cloud.google.com\n"
        "  Resend  → status.resend.com\n"
        "  Neon    → status.neon.tech\n"
        "  If their outage: wait — nothing to do on your end.\n"
        "  If your key: update GEMINI_API_KEY or RESEND_API_KEY in Cloud Run."
    ),
    "E — App Logic": (
        "Find the route in the log, reproduce locally with the same userId/input.\n"
        "  Look for: TypeError, null/undefined access, unexpected enum value.\n"
        "  Fix, test locally, then: gcloud run deploy --source . --region us-central1"
    ),
    "F — Performance": (
        "Check which route is slow (route field in SLOW_OPERATION logs).\n"
        "  Common fixes:\n"
        "  · Add a Prisma index to the slow query field\n"
        "  · Reduce the number of DB round trips (use include/select)\n"
        "  · Add Redis caching for expensive repeated queries"
    ),
}
for cat in top_cats:
    print(f"  [{cat}]")
    for line in FIX_GUIDE.get(cat, ("No specific guide available.",)).split("\n"):
        print(f"    {line}")
    print()

print("═" * 57)
print("  After fixing, verify with:")
print('  bash scripts/diagnose-incident.sh --since "$(date -u -d "10 minutes ago" +%Y-%m-%dT%H:%M:%SZ)"')
print("═" * 57)
print()
PYEOF
