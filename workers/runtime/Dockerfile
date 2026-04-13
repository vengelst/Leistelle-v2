FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY workers/runtime/package.json workers/runtime/package.json

RUN npm install --workspaces --include-workspace-root

COPY . .

RUN npm run build -w @leitstelle/contracts && npm run build

FROM node:24-alpine

WORKDIR /app

COPY --from=build /app/node_modules /app/node_modules
RUN rm -rf /app/node_modules/@leitstelle && mkdir -p /app/node_modules/@leitstelle

COPY --from=build /app/packages/config /app/node_modules/@leitstelle/config
COPY --from=build /app/packages/contracts /app/node_modules/@leitstelle/contracts
COPY --from=build /app/packages/observability /app/node_modules/@leitstelle/observability
COPY --from=build /app/apps/backend /app/apps/backend
COPY --from=build /app/workers/runtime /app/workers/runtime

CMD ["node", "workers/runtime/dist/index.js"]
