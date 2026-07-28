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

/**
 * Builds the JSON frame sent to the gateway.
 *
 * `sender` rides along untouched: the services only ever rewrite `content`, so
 * whatever else is on the frame survives the whole pipeline and comes back to
 * every client. That is what lets the UI tell your own messages apart without
 * the server having to know about identities.
 */
export const buildOutgoing = (type, channel, content, sender) =>
  JSON.stringify({ type, channel, content, sender });

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

/** Short, readable label for an opaque sender id. */
export const senderLabel = (sender) => {
  if (typeof sender !== 'string' || sender === '') return 'anon';
  return sender.replaceAll('-', '').slice(0, 4);
};

/** Deterministic hue, so a sender keeps the same colour for everyone. */
export const senderHue = (sender) => {
  const text = typeof sender === 'string' ? sender : '';
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 360;
  }
  return hash;
};

/** `HH:MM` in local time. Deterministic, unlike a locale-formatted string. */
export const formatTime = (date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * Turns an incoming frame into everything the view needs to render it, or
 * `null` when the frame should be ignored.
 *
 * @returns {{kind: 'notice', text: string}
 *   | {kind: 'message', text: string, isOwn: boolean, label: string, hue: number}
 *   | null}
 */
export const toDisplayMessage = (data, selfId) => {
  if (data === null || typeof data !== 'object') return null;

  const isOwn = typeof data.sender === 'string' && data.sender === selfId;

  switch (data.type) {
    case 'join':
      return {
        kind: 'notice',
        text: isOwn ? 'You joined the channel' : `${senderLabel(data.sender)} joined the channel`,
      };
    case 'message':
      return {
        kind: 'message',
        text: String(data.content ?? ''),
        isOwn,
        label: isOwn ? 'You' : senderLabel(data.sender),
        hue: senderHue(data.sender),
      };
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
