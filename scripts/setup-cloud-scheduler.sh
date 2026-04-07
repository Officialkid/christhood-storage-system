#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-cloud-scheduler.sh
#
# Creates (or updates) the four Google Cloud Scheduler jobs that replace
# the old Vercel Cron configuration.
#
# Prerequisites:
#   - gcloud CLI authenticated with a project that has Cloud Scheduler enabled
#   - CRON_SECRET env var set to the same value as in Cloud Run
#
# Usage:
#   export PROJECT_ID=dotted-spot-476513-i2
#   export REGION=us-central1
#   export APP_URL=https://cmmschristhood.org
#   export CRON_SECRET=<your-secret>
#   chmod +x scripts/setup-cloud-scheduler.sh
#   ./scripts/setup-cloud-scheduler.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dotted-spot-476513-i2}"
REGION="${REGION:-us-central1}"
APP_URL="${APP_URL:-https://cmmschristhood.org}"
CRON_SECRET="${CRON_SECRET:?CRON_SECRET environment variable must be set}"

# Ensure project is set
gcloud config set project "$PROJECT_ID" --quiet

# Helper: create or update a scheduler job
upsert_job() {
  local NAME="$1"
  local SCHEDULE="$2"
  local PATH="$3"
  local URI="${APP_URL}${PATH}"

  echo "→ Configuring Cloud Scheduler job: ${NAME}"

  if gcloud scheduler jobs describe "$NAME" --location="$REGION" --quiet 2>/dev/null; then
    # Job exists — update it
    gcloud scheduler jobs update http "$NAME" \
      --location="$REGION" \
      --schedule="$SCHEDULE" \
      --uri="$URI" \
      --http-method=GET \
      --headers="Authorization=Bearer ${CRON_SECRET}" \
      --time-zone="UTC" \
      --attempt-deadline="5m" \
      --quiet
    echo "  ✓ Updated"
  else
    # Job doesn't exist — create it
    gcloud scheduler jobs create http "$NAME" \
      --location="$REGION" \
      --schedule="$SCHEDULE" \
      --uri="$URI" \
      --http-method=GET \
      --headers="Authorization=Bearer ${CRON_SECRET}" \
      --time-zone="UTC" \
      --attempt-deadline="5m" \
      --quiet
    echo "  ✓ Created"
  fi
}

echo ""
echo "Setting up Cloud Scheduler jobs for Christhood CMMS..."
echo "  Project : ${PROJECT_ID}"
echo "  Region  : ${REGION}"
echo "  App URL : ${APP_URL}"
echo ""

# ── Archive files — daily at 02:00 UTC ───────────────────────────────────────
upsert_job "cmms-cron-archive"              "0 2 * * *"  "/api/cron/archive"

# ── Purge trash — daily at 03:00 UTC ─────────────────────────────────────────
upsert_job "cmms-cron-purge"                "0 3 * * *"  "/api/cron/purge"

# ── Storage check — daily at 04:00 UTC ───────────────────────────────────────
upsert_job "cmms-cron-storage-check"        "0 4 * * *"  "/api/cron/storage-check"

# ── Weekly digest — every Monday at 08:00 UTC ────────────────────────────────
upsert_job "cmms-cron-weekly-digest"        "0 8 * * 1"  "/api/cron/weekly-digest"

# ── Cleanup public share uploads — daily at 05:00 UTC ────────────────────────
upsert_job "cmms-cron-cleanup-public-shares" "0 5 * * *"  "/api/cron/cleanup-public-shares"

echo ""
echo "All Cloud Scheduler jobs configured successfully."
echo ""
echo "To verify, run:"
echo "  gcloud scheduler jobs list --location=${REGION} --filter='name:cmms-cron'"
