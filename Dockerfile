ARG NODE_VERSION=22-bookworm-slim
ARG SUPERCRONIC_VERSION=v0.2.34

# =================
# Base
# =================
FROM node:${NODE_VERSION} AS base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY ./prisma/ ./prisma/
COPY tsconfig.json ./tsconfig.json
COPY prisma.config.ts ./prisma.config.ts

RUN mkdir ./src

RUN --mount=type=cache,target=/root/.npm npm ci
RUN npm run prisma:generate

# =================
# Builder
# =================
FROM base AS builder
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY ./src ./src
COPY --from=base /app/tsconfig.json ./
COPY --from=base /app/src/generated ./dist/generated/
RUN npm run build

# =================
# Production server
# =================
FROM node:${NODE_VERSION} AS prod-server
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    tini \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts .
COPY --from=builder /app/tsconfig.json .
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json .

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=2s --start-period=10s --retries=3 CMD curl -fsS http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["sh", "-c", "npm run prisma:migrate && exec node /app/dist/server.js"]

# =================
# Production worker
# =================
FROM prod-server AS prod-worker
HEALTHCHECK NONE
ENTRYPOINT [ "" ]
CMD ["node", "/app/dist/worker/task.worker.js"]