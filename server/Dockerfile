# Build context is the repository root, because the npm workspace layout needs
# the root manifest and lockfile to install (see compose.yaml).
FROM node:26-alpine

WORKDIR /app

# Manifests first so `npm ci` stays cached across source-only changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY services/happy/package.json services/happy/
COPY services/capslock_mode/package.json services/capslock_mode/
RUN npm ci --omit=dev

COPY shared/ shared/
COPY server/ server/

USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
