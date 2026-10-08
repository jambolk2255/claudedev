# Build from the repository root: docker build -f apps/web/Dockerfile .
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS build
# Rewrites are compiled into the build, so the API address is a build argument.
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ENV API_URL=${API_URL} NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/schemas/package.json packages/schemas/
RUN pnpm install --frozen-lockfile --filter "@stockflow/web..."
COPY tsconfig.base.json ./
COPY packages/schemas packages/schemas
COPY apps/web apps/web
RUN pnpm --filter @stockflow/schemas build && pnpm --filter @stockflow/web build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
