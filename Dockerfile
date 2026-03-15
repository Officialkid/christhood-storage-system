# ═══════════════════════════════════════════════════════════════════════════════
# Stage 1 — deps
# Install all npm dependencies (including dev deps, because prisma generate and
# the TypeScript compiler are needed in stage 2).  We separate this stage so
# that Docker can cache the node_modules layer and only re-run npm ci when
# package-lock.json actually changes.
# ═══════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS deps

# libc6-compat provides the GNU C library shims that sharp (image processing)
# and some other native Node addons require on Alpine-based images.
# openssl is required so Prisma can detect the OpenSSL version (Alpine 3.17+
# ships OpenSSL 3) and generate/load the correct linux-musl-openssl-3.0.x engine.
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy only the files that affect dependency installation.
# Docker re-uses the cached layer from a previous build unless these change.
COPY package.json package-lock.json ./

# Copy the Prisma schema so the postinstall script (prisma generate) has it.
COPY prisma ./prisma

# Install all dependencies exactly as pinned in the lock file.
# This also runs the "postinstall" script which calls "prisma generate",
# producing the typed Prisma client in node_modules/@prisma/client.
RUN npm ci

# npm ci uses the lock file generated on Windows which does not include the
# linux-musl-x64 optional binary for sharp.  Install it explicitly so that
# Alpine (musl libc) containers can load the native sharp module at runtime.
RUN npm install --cpu=x64 --os=linux --libc=musl sharp


# ═══════════════════════════════════════════════════════════════════════════════
# Stage 2 — builder
# Compile the Next.js application.  The output is placed in .next/standalone/
# because we set output: 'standalone' in next.config.js.  That folder contains
# a minimal node server and only the node_modules slices that are actually
# imported at runtime — nothing else.
# ═══════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Bring in the installed node_modules from stage 1.
COPY --from=deps /app/node_modules ./node_modules

# Copy the full source tree.
# (The .dockerignore file keeps secrets, .git, and .next out of the context.)
COPY . .

# Disable Next.js anonymous telemetry inside the build environment.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application.
# The package.json "build" script is: prisma generate && next build
# prisma generate recreates the Prisma client inside this stage's file system,
# then next build compiles every page and produces .next/standalone/.
RUN npm run build


# ═══════════════════════════════════════════════════════════════════════════════
# Stage 3 — runner
# The final production image.  It receives only the compiled artefacts from
# stage 2 — no source code, no dev dependencies, no build tooling.
# This makes the image as small and secure as possible.
# ═══════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS runner

# Install:
#   ffmpeg  — system binary used by fluent-ffmpeg for video thumbnail generation
#   curl    — used by Docker/orchestrators for health-check probes
#   openssl — required so Prisma loads the linux-musl-openssl-3.0.x engine at runtime
RUN apk add --no-cache ffmpeg curl openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Tell fluent-ffmpeg where the system ffmpeg binary lives on Alpine Linux.
# Without this it falls back to searching PATH, which works too, but being
# explicit avoids any startup discovery delay.
ENV FFMPEG_PATH=/usr/bin/ffmpeg

# ── Security: non-root user ────────────────────────────────────────────────────
# Running as root inside a container is a security risk.  We create a dedicated
# system user/group and switch to it before the CMD.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# ── Copy the standalone build ──────────────────────────────────────────────────
# .next/standalone/ already includes its own trimmed node_modules snapshot.
# We own everything as nextjs:nodejs so the non-root user can read it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Static assets (.next/static/) are NOT bundled inside standalone — Next.js
# expects to find them at .next/static relative to the working directory.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static  ./.next/static

# Public assets (icons, manifest.json, sw.js, etc.) must also be copied.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# ── Prisma CLI + migration files ──────────────────────────────────────────────
# The standalone build strips node_modules down to runtime-only slices.
# prisma migrate deploy (called in start.sh) requires:
#   1. The prisma CLI package — contains the migration engine binary
#   2. The .bin/prisma symlink  — the executable entry point
#   3. The prisma/ directory   — migration SQL files + schema.prisma
# We copy these explicitly from the builder stage so the runner image stays
# small while still shipping everything migrate deploy needs.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/        ./node_modules/.bin/
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma/      ./node_modules/prisma/
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/     ./node_modules/@prisma/
COPY --from=builder --chown=nextjs:nodejs /app/prisma                    ./prisma

# Explicitly copy the sharp native binaries installed for Alpine (musl libc).
# Next.js standalone file tracing may omit optional platform-specific packages,
# so we copy them here to guarantee the correct linuxmusl binary is present.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp        ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img         ./node_modules/@img

# ── Startup script ────────────────────────────────────────────────────────────
# start.sh runs: prisma migrate deploy → exec node server.js
# If the migration fails the script exits non-zero and the container does not
# start, preventing the app from running against a stale schema.
COPY --chown=nextjs:nodejs scripts/start.sh ./start.sh
# chmod must run as root (before USER nextjs) to grant execute permission.
RUN chmod +x ./start.sh

# Switch to the non-root user for all subsequent commands, including CMD.
USER nextjs

# ── Port configuration ────────────────────────────────────────────────────────
# HOSTNAME — must be 0.0.0.0 so the server binds on all interfaces inside the
#            container (required for Cloud Run's load balancer to reach it).
# PORT     — Next.js standalone server.js reads process.env.PORT at startup.
#            3000 is the local / Docker Compose default.
#            Cloud Run overrides this at runtime with the value from --port=3000
#            in the deploy command, so local and cloud behaviour stay in sync.
# EXPOSE   — metadata only; the actual binding is controlled by server.js.
#            Use --port=3000 in your `gcloud run deploy` command to match.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

# start.sh applies pending Prisma migrations then exec-starts the Next.js
# server.  Using "exec" inside the script means node replaces sh and receives
# OS signals (SIGTERM) directly — enabling graceful shutdown without an extra
# signal-forwarding layer.
CMD ["sh", "start.sh"]
