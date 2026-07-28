import { isChannelSubject, isValidToken, serviceSubject } from './subjects.js';

/**
 * A pipeline message travels from service to service, each one transforming
 * `content` before handing it to the next hop:
 *
 *   { channel: 'channel.toto', pipeline: ['capslock_mode'], content: {...} }
 *
 * When `pipeline` is exhausted the (transformed) content is delivered to the
 * chat channel on core NATS instead of being forwarded.
 */

/** Lifts a `content -> content` function into a `message -> message` one. */
export const mapContent = (fun) => (obj) => ({
  ...obj,
  content: fun(obj?.content),
});

/**
 * Decides what to do with `message` after applying `transform` to it.
 *
 * Pure: returns a `{ kind, subject, payload }` description instead of touching
 * the network, which is what makes the routing rules directly testable.
 *
 * @returns {{kind: 'deliver'|'forward', subject: string, payload: string}}
 */
export const route = (message, transform) => {
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    throw new TypeError('pipeline message must be an object');
  }

  const { channel, pipeline = [] } = message;
  if (!isChannelSubject(channel)) {
    throw new TypeError(`invalid channel subject: ${JSON.stringify(channel)}`);
  }
  if (!Array.isArray(pipeline)) {
    throw new TypeError('pipeline must be an array');
  }

  const [next, ...rest] = pipeline;
  const content = transform(message.content);

  // Last hop: hand the result to the clients listening on the chat channel.
  if (next === undefined) {
    return { kind: 'deliver', subject: channel, payload: JSON.stringify(content) };
  }

  if (!isValidToken(next)) {
    throw new TypeError(`invalid service name in pipeline: ${JSON.stringify(next)}`);
  }

  return {
    kind: 'forward',
    subject: serviceSubject(next),
    payload: JSON.stringify({ ...message, pipeline: rest, content }),
  };
};

/**
 * Performs the action produced by {@link route}. `deliver` goes out on core
 * NATS (fire-and-forget fan-out to connected clients); `forward` goes through
 * JetStream so the next service gets an at-least-once, replayable handoff.
 */
export const dispatch = async ({ nc, js }, action) => {
  if (action.kind === 'deliver') {
    nc.publish(action.subject, action.payload);
    return;
  }
  await js.publish(action.subject, action.payload);
};
