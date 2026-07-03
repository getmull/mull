# Build context is the repo root (see docker-compose.yml) — this is a pnpm
# workspace, so pnpm-lock.yaml and every workspace member's package.json
# need to be reachable to install correctly.
#
# Deliberately NOT using `output: standalone` + Node's traced output here.
# As of Next 16.2.9 that path has multiple tracing gaps for this app's
# dependency mix (see next.config.ts for details) — this ships the full
# node_modules tree instead and runs `next start`, which is slower to build
# and larger on disk, but doesn't depend on file-tracing being correct.

FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN corepack enable pnpm && pnpm --filter web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start"]
