import {
  buildOutgoing,
  channelFromHash,
  formatTime,
  parseIncoming,
  resolveWebSocketUrl,
  toDisplayMessage,
} from './protocol.js';

// config.js is generated at container start from $WEBSOCKET_URL. Opening the
// page straight from disk has no such file, so fall back to the same host.
let configured = '';
try {
  ({ WEBSOCKET_URL: configured } = await import('./config.js'));
} catch {
  console.warn('no config.js found, deriving the WebSocket URL from the page location');
}

const channelName = channelFromHash(location.hash);
const websocketUrl = resolveWebSocketUrl(configured, location);

/**
 * Stable per-tab identity, so the UI can tell your own messages apart. It is
 * only ever used for display: the server neither reads nor trusts it.
 */
const selfId = (() => {
  const key = 'poc-chat.sender-id';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();

const messageList = document.getElementById('messages-list');
const emptyState = document.getElementById('empty-state');
const composer = document.getElementById('composer');
const sendInput = document.getElementById('send-input');
const sendButton = document.getElementById('send-btn');
const status = document.getElementById('status');
const statusLabel = document.getElementById('status-label');

document.getElementById('channel-name').textContent = channelName;
document.title = `#${channelName} — POC chat`;
sendInput.placeholder = `Message #${channelName}`;

const STATUS_TEXT = {
  connecting: 'Connecting…',
  online: 'Connected',
  offline: 'Disconnected',
};

const setStatus = (state) => {
  status.dataset.state = state;
  statusLabel.textContent = STATUS_TEXT[state];
  const offline = state !== 'online';
  sendInput.disabled = offline;
  sendButton.disabled = offline;
};

/** Only auto-scroll when already at the bottom, so reading history is not hijacked. */
const isPinnedToBottom = () =>
  messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 80;

const append = (node) => {
  const pinned = isPinnedToBottom();
  emptyState?.remove();
  messageList.appendChild(node);
  if (pinned) messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' });
};

const renderNotice = (text) => {
  const el = document.createElement('p');
  el.className = 'notice';
  el.textContent = text;
  append(el);
};

const renderMessage = ({ text, isOwn, label, hue }) => {
  const wrapper = document.createElement('article');
  wrapper.className = isOwn ? 'message message--own' : 'message';

  const meta = document.createElement('p');
  meta.className = 'message__meta';

  const author = document.createElement('span');
  author.className = 'message__author';
  author.textContent = label;
  if (!isOwn) author.style.setProperty('--author-color', `oklch(0.62 0.15 ${hue})`);

  const time = document.createElement('time');
  const now = new Date();
  time.dateTime = now.toISOString();
  time.textContent = formatTime(now);

  meta.append(author, time);

  const bubble = document.createElement('div');
  bubble.className = 'message__bubble';
  bubble.textContent = text;

  wrapper.append(meta, bubble);
  append(wrapper);
};

let connection = null;
let isWsOpen = false;
let retryDelay = 500;

const wsSend = (type, content) => {
  if (!isWsOpen) return false;
  connection.send(buildOutgoing(type, channelName, content, selfId));
  return true;
};

const connect = () => {
  setStatus('connecting');
  connection = new WebSocket(websocketUrl);

  connection.onopen = () => {
    isWsOpen = true;
    retryDelay = 500;
    setStatus('online');
    wsSend('join', 'HELLO!');
    sendInput.focus();
  };

  connection.onmessage = (event) => {
    const data = parseIncoming(event.data);
    if (data === null) return;

    const view = toDisplayMessage(data, selfId);
    if (view === null) return;

    if (view.kind === 'notice') renderNotice(view.text);
    else renderMessage(view);
  };

  connection.onerror = () => {
    // `onclose` always follows, which is where reconnection is handled.
    isWsOpen = false;
  };

  connection.onclose = () => {
    isWsOpen = false;
    setStatus('offline');
    // Retry with a capped backoff so a broker restart recovers on its own.
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 10_000);
  };
};

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = sendInput.value.trim();
  if (text === '') return;
  if (!wsSend('message', text)) return;
  sendInput.value = '';
  sendInput.focus();
});

// Switching channel is a different room; reload so state starts clean.
addEventListener('hashchange', () => location.reload());

connect();
