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

FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY --from=build /app/apps/frontend/index.html /usr/share/nginx/html/index.html
COPY --from=build /app/apps/frontend/src/styles.css /usr/share/nginx/html/src/styles.css
COPY --from=build /app/apps/frontend/config.template.js /opt/leitstelle/config.template.js
COPY --from=build /app/apps/frontend/docker-entrypoint.sh /docker-entrypoint.d/40-leitstelle-config.sh
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html/dist

RUN chmod +x /docker-entrypoint.d/40-leitstelle-config.sh

EXPOSE 80
