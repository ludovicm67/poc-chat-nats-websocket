/**
 * Pure client-side protocol helpers. No DOM access, so they can be unit tested
 * directly under Node.
 */

export const DEFAULT_CHANNEL = 'toto';

/** `#toto` -> `toto`; empty/missing hash falls back to the default channel. */
export const channelFromHash = (hash) => {
  const name = String(hash ?? '').replace(/^#/, '');
  return name === '' ? DEFAULT_CHANNEL : name;
};

/** Builds the JSON frame sent to the gateway. */
export const buildOutgoing = (type, channel, content) =>
  JSON.stringify({ type, channel, content });

/**
 * Parses a frame coming back from the gateway.
 *
 * @returns {{type: string, content: unknown} | null} `null` when the frame is
 *   unusable, so callers can simply ignore it.
 */
export const parseIncoming = (raw) => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  if (typeof data.type !== 'string') return null;
  return data;
};

/** Renders an incoming frame as the line to display, or `null` to skip it. */
export const describe = (data) => {
  switch (data?.type) {
    case 'join':
      return 'Someone joined the channel!';
    case 'message':
      return `someone: ${data.content}`;
    default:
      return null;
  }
};

/** Falls back to a same-host WebSocket URL when none was configured. */
export const resolveWebSocketUrl = (configured, location) => {
  if (configured) return configured;
  const protocol = location?.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location?.hostname ?? 'localhost'}:3001`;
};
