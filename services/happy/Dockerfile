# Build context is the repository root (see compose.yaml).
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY services/happy/package.json services/happy/
COPY services/capslock_mode/package.json services/capslock_mode/
RUN npm ci --omit=dev

COPY shared/ shared/
COPY services/happy/ services/happy/

USER node
CMD ["node", "services/happy/index.js"]
