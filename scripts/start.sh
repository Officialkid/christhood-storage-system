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

echo "[start.sh] Running database migrations..."

# prisma migrate deploy:
#   - Applies every migration file in prisma/migrations/ that has not yet been
#     applied to the target database.
#   - Records each applied migration in the _prisma_migrations table.
#   - Is idempotent: already-applied migrations are silently skipped.
#   - Is safe for production: it never drops tables, never resets data, and
#     never generates new migration files.
#   - Exits with code 1 if a migration fails, which causes set -e to abort
#     this script — the container will not start with a broken schema.
node node_modules/.bin/prisma migrate deploy

echo "[start.sh] Migrations applied successfully."
echo "[start.sh] Starting Next.js server..."

# "exec" replaces the shell process with the node process.
# Without exec, node would be a child of sh.  With exec, node becomes PID 1
# (or the direct child of dumb-init) and receives SIGTERM/SIGINT directly,
# enabling graceful shutdown without an extra signal-forwarding layer.
exec node server.js
