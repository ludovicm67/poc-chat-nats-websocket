import { createLogger } from './logger.js';
import { connectToNats, ensureServicesStream, jetstream, jetstreamManager } from './nats.js';
import { dispatch, mapContent, route } from './pipeline.js';
import { durableName, SERVICES_STREAM } from './subjects.js';

/**
 * Boots a pipeline service: consumes its own `service.<name>` subject from
 * JetStream, applies `transform` to the message content, and hands the result
 * to the next hop (or to the chat channel when the pipeline is done).
 *
 * This replaces the old NATS Streaming (STAN) durable queue subscription:
 * a JetStream durable pull consumer filtered on the service's subject gives
 * the same at-least-once delivery with explicit acks.
 *
 * @param {object} options
 * @param {(content: unknown) => unknown} options.transform applied to the payload
 * @param {string} options.channelName subject to consume, e.g. `service.happy`
 * @param {string[]} options.servers NATS server URLs
 * @returns {Promise<{close: () => Promise<void>}>}
 */
export const runService = async ({
  transform,
  channelName,
  servers,
  logger = createLogger(channelName),
}) => {
  const nc = await connectToNats({ servers, name: channelName });
  logger.info(`connected to ${nc.getServer()}`);

  await ensureServicesStream(nc);

  const durable = durableName(channelName);
  const jsm = await jetstreamManager(nc);
  await jsm.consumers.add(SERVICES_STREAM, {
    durable_name: durable,
    filter_subject: channelName,
    ack_policy: 'explicit',
  });

  const js = jetstream(nc);
  const consumer = await js.consumers.get(SERVICES_STREAM, durable);
  const messages = await consumer.consume();
  logger.info(`consuming ${channelName} (durable ${durable})`);

  const transformMessage = mapContent(transform);

  const pump = (async () => {
    for await (const msg of messages) {
      try {
        const action = route(msg.json(), transformMessage);
        await dispatch({ nc, js }, action);
        msg.ack();
        logger.info(`${action.kind} -> ${action.subject}`);
      } catch (err) {
        // Malformed or unroutable: terminate instead of ack'ing so it is not
        // redelivered forever as a poison message.
        logger.error('dropping unprocessable message:', err.message);
        msg.term();
      }
    }
  })();

  return {
    nc,
    close: async () => {
      messages.stop();
      await pump;
      await nc.drain();
    },
  };
};
