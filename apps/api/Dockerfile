# Build from the repository root: docker build -f apps/api/Dockerfile .
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile --filter "@stockflow/api..."
COPY tsconfig.base.json ./
COPY packages/schemas packages/schemas
COPY apps/api apps/api
RUN pnpm --filter @stockflow/schemas build && pnpm --filter @stockflow/api build
# Self-contained production bundle with only runtime dependencies.
RUN pnpm --filter @stockflow/api deploy --prod --legacy /out \
  && cp -r apps/api/dist apps/api/prisma /out/ \
  && cd /out && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production PORT=4000
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1
# Apply pending migrations, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
