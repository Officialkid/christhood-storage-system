#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# scripts/start.sh — Production container entrypoint for the Next.js app
#
# Sequence:
#   1. Apply any pending database migrations (safe, never destructive)
#   2. Start the Next.js standalone server
#
# "set -e" means: exit immediately if any command returns a non-zero status.
# If prisma migrate deploy fails, this script exits with an error code and
# Docker marks the container as failed — it will NOT proceed to start the app.
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "[start.sh] Waiting for database to be reachable..."

# Retry loop: Neon's serverless pooler may take a few seconds to wake up on
# first connection, causing a P1001 error. We retry up to 10 times with a
# 3-second delay before giving up and crashing the container.
RETRIES=10
DELAY=3
i=1
while [ "$i" -le "$RETRIES" ]; do
  node node_modules/.bin/prisma migrate deploy && break
  echo "[start.sh] Migration attempt $i/$RETRIES failed, retrying in ${DELAY}s..."
  sleep $DELAY
  i=$((i + 1))
done

# If all retries were exhausted the loop exited without break, meaning the
# last attempt also failed. set -e won't catch that automatically inside a
# while loop, so we re-run one final time outside so set -e can abort.
if [ "$i" -gt "$RETRIES" ]; then
  echo "[start.sh] All $RETRIES migration attempts failed. Aborting."
  node node_modules/.bin/prisma migrate deploy
fi

echo "[start.sh] Migrations applied successfully."
echo "[start.sh] Starting Next.js server..."

# "exec" replaces the shell process with the node process.
# Without exec, node would be a child of sh.  With exec, node becomes PID 1
# (or the direct child of dumb-init) and receives SIGTERM/SIGINT directly,
# enabling graceful shutdown without an extra signal-forwarding layer.
exec node server.js
