const nats = require('nats');
const stan = require('node-nats-streaming');
const uuid = require('uuid/v4');

const clusterName = process.env.CLUSTER_NAME || 'cluster-test';
const channelName = process.env.CHANNEL_NAME || `service.${uuid()}`;
const envServers = process.env.NATS_SERVERS || ['nats://localhost:4222'];
const servers = envServers.split(',');
const nc = nats.connect({ encoding: 'binary', preserveBuffers: true, servers });
const sc = stan.connect(clusterName, uuid(), { nc });

const mapContent = fun => obj => ({
  ...obj,
  content: fun(obj.content),
});

const popService = (message, fun) => {
  const [svc, ...pipeline] = message.pipeline;
  const content = fun(message.content);
  if (!svc) {
    nc.publish(message.channel, JSON.stringify(content));
  } else {
    sc.publish(`service.${svc}`, JSON.stringify({
      ...message,
      pipeline,
      content,
    }));
  }
};

sc.on('connect', () => {
  const opts = sc.subscriptionOptions();
  const subscription = sc.subscribe(channelName, channelName, opts);
  subscription.on('message', msg => {
    const message = JSON.parse(msg.getData());
    console.log('Received a message [' + msg.getSequence() + '] ', message);
    popService(message, mapContent(c => `${c} 🙂`));
  });
});
