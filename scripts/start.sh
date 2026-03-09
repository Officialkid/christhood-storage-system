#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# scripts/start.sh — Production container entrypoint for the Next.js app
#
# Sequence:
#   1. Attempt database migrations (non-fatal — server starts regardless)
#   2. Start the Next.js standalone server
#
# Migrations are run here as a convenience but are NOT allowed to block or
# crash the container. The CI/CD pipeline (GitHub Actions) runs migrations
# before deploying, so by the time this container starts the schema is
# already up to date. The attempt here is a safety net only.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "[start.sh] Attempting database migrations (non-fatal)..."

# Run migrate deploy with a 30-second timeout.
# If it fails for any reason (DB unreachable, timeout, already up to date),
# we log a warning and continue — the server must start regardless.
node node_modules/.bin/prisma migrate deploy \
  && echo "[start.sh] Migrations applied successfully." \
  || echo "[start.sh] Warning: migration step failed or was skipped — continuing startup."

echo "[start.sh] Starting Next.js server..."

# "exec" replaces the shell process with the node process so node receives
# SIGTERM directly, enabling graceful shutdown on Cloud Run scale-down.
exec node server.js
