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
# Build/deploy timestamp, stamped at `docker build` time (Fly passes it via
# [build.args] in worker.fly.toml). Surfaced by the worker at boot so logs show
# exactly which build is running.
ARG BUILD_DATE=unknown
ENV BUILD_DATE=${BUILD_DATE}
# FFmpeg + fonts. DejaVu (fonts-dejavu-core) is the always-present serif fallback
# for title cards; ffmpeg itself is the only hard requirement here. Keep this
# layer free of any network dependency beyond the Debian mirror so the build
# can't fail on a third-party fetch.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Cinzel is the preferred elegant serif for numbered title cards (see
# packages/ffmpeg/src/fonts.ts). It's fetched from Google Fonts' GitHub mirror,
# but this is a BEST-EFFORT step: if the download fails or the upstream path
# moves, `|| true` keeps the build green and titleCardFont() falls back to the
# DejaVu serif installed above. Isolated in its own layer so a network blip here
# never invalidates or aborts the apt layer.
RUN mkdir -p /usr/share/fonts/truetype/cinzel \
    && ( curl -fsSL --retry 3 --retry-delay 2 -o /usr/share/fonts/truetype/cinzel/Cinzel-SemiBold.ttf \
         https://github.com/google/fonts/raw/main/ofl/cinzel/static/Cinzel-SemiBold.ttf \
       || echo 'WARN: Cinzel font fetch failed; title cards will use DejaVu serif' ) \
    && fc-cache -f \
    && apt-get purge -y curl && apt-get autoremove -y || true
RUN groupadd -r nodejs && useradd -r -g nodejs worker && \
    mkdir -p /scratch && chown worker:nodejs /scratch
COPY --from=build --chown=worker:nodejs /app/deploy ./
USER worker
EXPOSE 8080
CMD ["node", "dist/main.js"]
