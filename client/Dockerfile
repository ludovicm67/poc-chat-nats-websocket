# Build context is the repository root (see compose.yaml).
FROM nginx:1.31-alpine

# nginx's own entrypoint runs every executable in /docker-entrypoint.d before
# starting the server, so the generated config.js is always up to date.
COPY client/docker-entrypoint.d/40-write-config.sh /docker-entrypoint.d/40-write-config.sh
RUN chmod +x /docker-entrypoint.d/40-write-config.sh

COPY client/index.html client/app.js client/protocol.js /usr/share/nginx/html/

EXPOSE 80
