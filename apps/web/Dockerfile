FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json ./
# pnpm-lock.yaml lives in apps/web when building standalone; fall back to
# regular install if the lock file diverges from the workspace root.
COPY pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --no-frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
