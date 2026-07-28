import {
  buildOutgoing,
  channelFromHash,
  describe,
  parseIncoming,
  resolveWebSocketUrl,
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

// interface elements
const msgList = document.getElementById('messages-list');
const sendInput = document.getElementById('send-input');
const sendButton = document.getElementById('send-btn');
document.getElementById('channel-name').innerText = `#${channelName}`;

const appendLine = (text) => {
  const div = document.createElement('div');
  div.innerText = text;
  msgList.appendChild(div);
};

const connection = new WebSocket(websocketUrl);
let isWsOpen = false;

const wsSend = (type, content) => {
  if (!isWsOpen) {
    console.error('websocket is closed');
    return;
  }
  connection.send(buildOutgoing(type, channelName, content));
};

connection.onopen = () => {
  console.log('connection opened');
  isWsOpen = true;
  wsSend('join', 'HELLO!');
};

connection.onerror = (error) => {
  console.error('error:', error);
  isWsOpen = false;
};

connection.onclose = () => {
  console.log('connection closed');
  isWsOpen = false;
};

connection.onmessage = (msg) => {
  const data = parseIncoming(msg.data);
  if (data === null) return;
  console.log('got message:', data);
  const line = describe(data);
  if (line !== null) appendLine(line);
};

// sending a message
sendButton.addEventListener('click', () => {
  const msg = sendInput.value;
  if (msg === '') return;
  console.log('send msg:', msg);
  wsSend('message', msg);
  sendInput.value = '';
});

sendInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') sendButton.click();
});
