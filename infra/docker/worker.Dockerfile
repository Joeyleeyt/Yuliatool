# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Background worker — includes FFmpeg for the rendering pipeline.
# ---------------------------------------------------------------------------
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/ffmpeg/package.json packages/ffmpeg/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Re-link the workspace: the deps stage only carries the root node_modules (+ the
# .pnpm store); pnpm's isolated layout keeps each package's deps under
# packages/*/node_modules, which aren't copied. Re-running install (offline, from
# the store) recreates those per-package symlinks so tsc can resolve deps.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline
RUN pnpm --filter @yulia/worker... build && \
    pnpm --filter @yulia/worker deploy --prod /app/deploy
# The @yulia/* packages export TS source (./src/*.ts) for tsx-based dev. Production
# runs plain `node`, so repoint each deployed package's exports at its compiled
# ./dist/*.js (pnpm ships dist but doesn't apply publishConfig on deploy).
RUN node infra/docker/fix-workspace-exports.mjs /app/deploy

# --- runtime: slim node + ffmpeg -------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# FFmpeg + fonts (for future text overlays) from Debian repos.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd -r nodejs && useradd -r -g nodejs worker && \
    mkdir -p /scratch && chown worker:nodejs /scratch
COPY --from=build --chown=worker:nodejs /app/deploy ./
USER worker
EXPOSE 8080
CMD ["node", "dist/main.js"]
