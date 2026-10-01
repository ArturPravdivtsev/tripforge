FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/ui/package.json ./packages/ui/package.json

RUN --mount=type=cache,id=tripforge-pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM dependencies AS builder

COPY . .

RUN pnpm --filter @tripforge/api... build

FROM base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/ui/package.json ./packages/ui/package.json

RUN --mount=type=cache,id=tripforge-pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter @tripforge/api

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=production-dependencies --chown=node:node /workspace/node_modules /app/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=builder --chown=node:node /workspace/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=builder --chown=node:node /workspace/packages/contracts/dist /app/packages/contracts/dist

USER node

EXPOSE 4000

CMD ["node", "dist/main.js"]

FROM runtime AS migration

COPY --chown=node:node apps/api/drizzle ./drizzle

CMD ["node", "dist/migrate.js"]
