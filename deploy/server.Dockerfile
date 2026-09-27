# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY apps/mobile/package.json apps/mobile/
COPY packages/client-core/package.json packages/client-core/
COPY e2e/package.json e2e/
# Install only what the BFF and the web build need (skips Electron/Expo/Playwright).
RUN npm ci --no-audit --no-fund -w @masterhand/server -w @masterhand/web

COPY tsconfig.base.json ./
COPY packages/client-core packages/client-core
COPY apps/server apps/server
COPY apps/web apps/web

RUN npm run build -w @masterhand/web \
  && npm run build -w @masterhand/server \
  && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV DATA_DIR=/data
WORKDIR /app

RUN mkdir -p /data && chown node:node /data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

USER node
EXPOSE 8787
CMD ["node", "apps/server/dist/index.js"]
