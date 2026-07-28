import { isValidToken } from '@poc/shared';

/** Message kinds a client may send. Anything else is broadcast verbatim. */
export const JOIN = 'join';
export const MESSAGE = 'message';

/**
 * Parses and validates a raw WebSocket frame.
 *
 * Everything here comes from the browser, so a frame is only accepted once we
 * know it is JSON, is an object, and carries a channel name safe to splice
 * into a NATS subject.
 *
 * @returns {{ok: true, message: object} | {ok: false, reason: string}}
 */
export const parseClientMessage = (raw) => {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }

  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return { ok: false, reason: 'not a JSON object' };
  }
  if (typeof message.type !== 'string') {
    return { ok: false, reason: 'missing type' };
  }
  if (!isValidToken(message.channel)) {
    return { ok: false, reason: `invalid channel: ${JSON.stringify(message.channel)}` };
  }

  return { ok: true, message };
};

/**
 * Wraps a chat message into the envelope the pipeline services consume.
 * `pipeline` lists the services still to run *after* the first one.
 */
export const buildPipelineEnvelope = ({ channelSubject, message, pipeline }) => ({
  pipeline: [...pipeline],
  channel: channelSubject,
  content: message,
});
