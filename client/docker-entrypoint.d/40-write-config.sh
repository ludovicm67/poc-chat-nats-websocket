#!/bin/sh
# Generates config.js from $WEBSOCKET_URL at container start.
#
# The previous version rewrote a placeholder inside app.js with sed, which
# mutated a source file in place. Emitting a separate module keeps app.js
# pristine and makes the step repeatable across restarts.
set -eu

url="${WEBSOCKET_URL:-}"

# Escape backslashes first, then single quotes, so the value is safe to embed
# in a single-quoted JS string literal.
escaped=$(printf '%s' "$url" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g")

cat > /usr/share/nginx/html/config.js <<EOF
// Generated at container start. Do not edit.
export const WEBSOCKET_URL = '${escaped}';
EOF

echo "client: WEBSOCKET_URL=${url:-<derived from page location>}"
