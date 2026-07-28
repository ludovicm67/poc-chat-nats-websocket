import http from 'node:http';

import { channelSubject, createLogger, jetstream, serviceSubject } from '@poc/shared';
import { WebSocketServer } from 'ws';

import { buildPipelineEnvelope, JOIN, MESSAGE, parseClientMessage } from './protocol.js';

/**
 * Services a chat message is pushed through, in order. The first entry is the
 * subject the server publishes to; the rest travel with the message so each
 * service knows who to hand off to.
 */
export const DEFAULT_PIPELINE = ['happy', 'capslock_mode'];

/**
 * Starts the WebSocket gateway.
 *
 * Browser clients speak JSON over WebSocket; the gateway fans messages out on
 * core NATS (`channel.<name>`) and pushes chat messages into the JetStream
 * service pipeline.
 *
 * @param {object} options
 * @param {import('@nats-io/transport-node').NatsConnection} options.nc
 * @param {number} options.port `0` picks a free port (used by the tests)
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
export const createChatServer = async ({
  nc,
  port = 3001,
  pipeline = DEFAULT_PIPELINE,
  logger = createLogger('server'),
}) => {
  const js = jetstream(nc);
  const [firstService, ...restOfPipeline] = pipeline;

  const httpServer = http.createServer((req, res) => {
    // Plain HTTP is only used for container health checks; everything else
    // happens over the WebSocket upgrade.
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket, req) => {
    const peer = req.socket.remoteAddress;
    logger.info(`connection accepted from ${peer}`);

    // One core-NATS subscription per connection, torn down on close so that
    // disconnecting clients do not leak subscriptions into the broker.
    let subscription = null;

    const joinChannel = (name) => {
      const subject = channelSubject(name);
      subscription?.unsubscribe();
      subscription = nc.subscribe(subject, {
        callback: (err, msg) => {
          if (err) {
            logger.error('subscription error:', err.message);
            return;
          }
          if (socket.readyState === socket.OPEN) socket.send(msg.string());
        },
      });
      return subject;
    };

    socket.on('message', async (data, isBinary) => {
      if (isBinary) return;
      const raw = data.toString('utf-8');

      const parsed = parseClientMessage(raw);
      if (!parsed.ok) {
        logger.error(`rejected frame: ${parsed.reason}`);
        return;
      }
      const { message } = parsed;
      logger.info('received:', message);

      try {
        if (message.type === JOIN) {
          const subject = joinChannel(message.channel);
          nc.publish(subject, raw);
          return;
        }

        if (message.type === MESSAGE) {
          // Chat messages take the durable path: JetStream hands them to the
          // first service, which forwards down the rest of the pipeline.
          await js.publish(
            serviceSubject(firstService),
            JSON.stringify(
              buildPipelineEnvelope({
                channelSubject: channelSubject(message.channel),
                message,
                pipeline: restOfPipeline,
              }),
            ),
          );
          return;
        }

        // Anything else is broadcast as-is to the channel.
        nc.publish(channelSubject(message.channel), raw);
      } catch (err) {
        logger.error('failed to handle message:', err.message);
      }
    });

    socket.on('close', () => {
      subscription?.unsubscribe();
      subscription = null;
      logger.info(`peer ${peer} disconnected`);
    });

    socket.on('error', (err) => logger.error('socket error:', err.message));
  });

  await new Promise((resolve) => httpServer.listen(port, resolve));
  const boundPort = httpServer.address().port;
  logger.info(`listening on port ${boundPort}`);

  return {
    port: boundPort,
    close: async () => {
      for (const socket of wss.clients) socket.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
};
