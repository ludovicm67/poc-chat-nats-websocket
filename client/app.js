// get channel name
const channelName = (location.hash == '') ? '#toto' : `${location.hash}`;
document.getElementById('channel-name').innerText = channelName;

// interface elements
const msgList = document.getElementById('messages-list');
const sendInput = document.getElementById('send-input');
const sendButton = document.getElementById('send-btn');

// websocket init
window.WebSocket = window.WebSocket || window.MozWebSocket;
const connection = new WebSocket('ws://127.0.0.1:3001');
connection.binaryType = 'blob';
let isWsOpen = false;

// functions
const someoneJoined = () => {
  const div = document.createElement('div');
  div.innerText = 'Someone joined the channel!';
  msgList.appendChild(div);
};

const someoneMessaged = (msg) => {
  const div = document.createElement('div');
  div.innerText = `someone: ${msg}`;
  msgList.appendChild(div);
};


const wsSend = (type, content) => {
  if (!isWsOpen) return;
  connection.send(JSON.stringify({
    type,
    channel: channelName.replace(/^#/, ''),
    content,
  }));
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

connection.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  console.log('got message:', data);
  switch (data.type) {
    case 'join':
      someoneJoined();
      break;
    case 'message':
      someoneMessaged(data.content);
      break;
    default:
      // ignore message
  }
};

// sending a message
sendButton.addEventListener('click', () => {
  if (!isWsOpen) {
    console.error('websocket is closed');
    return;
  }
  const msg = sendInput.value;
  console.log('send msg:', msg);
  wsSend('message', msg);
});

sendInput.addEventListener('keyup', e => {
  if (e.keyCode == 13) {
    sendButton.click();
    sendInput.value = '';
  }
});