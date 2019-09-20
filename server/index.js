const nats = require('nats');
const webSocketServer = require('websocket').server;
const http = require('http');
const stan = require('node-nats-streaming');
const uuid = require('uuid/v4');

const port = process.env.SERVER_PORT || 3001;
const clusterName = process.env.CLUSTER_NAME || 'cluster-test';
const envServers = process.env.NATS_SERVERS || ['nats://localhost:4222'];
const servers = envServers.split(',');
const nc = nats.connect({ encoding: 'binary', preserveBuffers: true, servers });
const sc = stan.connect(clusterName, uuid(), { nc });

const clients = [];

const logWithDate = (...msg) => {
  const date = new Date();
  console.log(`${date}:`, ...msg);
};

const server = http.createServer((_req, _res) => {});
server.listen(port, () => {});
const wsServer = new webSocketServer({httpServer: server});
wsServer.on('request', request => {
  logWithDate('ws: request connection');
  const connection = request.accept(null, request.origin);
  const clientIndex = clients.push({
    channel: null,
    connection,
  }) - 1;
  logWithDate('ws: connection accepted');
  connection.on('message', message => {
    if (message.type != 'utf8') return;
    const msg = JSON.parse(message.utf8Data);
    if (msg.type === 'join') {
      Object.assign(clients[clientIndex], {
        channel: msg.channel,
      });
      nc.subscribe(`channel.${msg.channel}`, (msg, _reply, _subject, _sid) => {
        connection.send(msg.toString('utf-8'));
      });
      nc.publish(`channel.${msg.channel}`, message.utf8Data);
    } else if (msg.type === 'message') {
      sc.publish('service.happy', JSON.stringify({
        pipeline: [
          'capslock_mode',
        ],
        channel: `channel.${msg.channel}`,
        content: msg,
      }));
    } else {
      // broadcast
      nc.publish(`channel.${msg.channel}`, Buffer.from(message.utf8Data, 'utf-8'));
    }
    logWithDate('ws: receved following message:', msg);
  });
  connection.on('close', con => {
    logWithDate(`ws: peer ${con.remoteAddress} disconnected.`);
    clients.splice(clientIndex);
  });
});

nc.publish('channel.toto', 'Hello World!');
nc.publish('channel.toto.state', 'Hello World!');
nc.publish('channel.titi', 'Hello World!');

nc.subscribe('channel.*', (msg, _reply, subject, _sid) => {
  console.log(`channel*: ${subject} : ${msg}`);
});
nc.subscribe('channel.>', (msg, _reply, subject, _sid) => {
  console.log(`channel>: ${subject} : ${msg}`);
});
