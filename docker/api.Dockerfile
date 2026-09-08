# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

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

FROM dependencies AS migration

COPY . .

WORKDIR /workspace/apps/api

ENV NODE_ENV=production

USER node

CMD ["./node_modules/.bin/drizzle-kit", "migrate"]

FROM dependencies AS builder

COPY . .

RUN pnpm --filter @tripforge/api build

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

FROM node:24-bookworm-slim AS runtime

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=production-dependencies --chown=node:node /workspace/node_modules /app/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/api/dist ./dist

USER node

EXPOSE 4000

CMD ["node", "dist/main.js"]
