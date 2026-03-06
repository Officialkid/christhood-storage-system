# ── Christhood CMMS — Background Worker ──────────────────────────────────────
#
# Base image: node:20-alpine  (small, same Node version as the Next.js app)
#
# Build this with the REPOSITORY ROOT as the Docker build context so that
# the Prisma schema can be copied in:
#
#   docker build -f workers/Dockerfile -t christhood-worker .
#
# The docker-compose.yml should set:
#   build:
#     context: .
#     dockerfile: workers/Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

# dumb-init acts as PID 1 and forwards signals (SIGTERM/SIGINT) to the Node
# process, enabling graceful shutdown inside containers.
# openssl is required so Prisma detects OpenSSL 3 and loads the correct engine.
RUN apk add --no-cache dumb-init openssl

WORKDIR /app

# ── 1. Install dependencies ───────────────────────────────────────────────────
# Copy package.json first so Docker caches the npm install layer.
COPY workers/package.json ./

# Copy the Prisma schema so that the postinstall script ("prisma generate")
# can generate the PrismaClient before the worker script runs.
COPY prisma ./prisma

# In production: omit devDependencies to keep the image small.
# In development (NODE_ENV=development build arg): install everything so
# nodemon is available for the docker-compose.dev.yml command override.
ARG NODE_ENV=production
RUN if [ "$NODE_ENV" = "development" ]; then \
      npm install; \
    else \
      npm install --omit=dev; \
    fi

# ── 2. Copy worker source ─────────────────────────────────────────────────────
COPY workers/index.js ./

# ── 3. Non-root user ──────────────────────────────────────────────────────────
# Running as a non-root user limits the blast radius of any container escape.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 worker

USER worker

# ── 4. Runtime ────────────────────────────────────────────────────────────────
# dumb-init wraps node so OS signals propagate correctly.
CMD ["dumb-init", "node", "index.js"]
