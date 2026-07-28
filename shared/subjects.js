/**
 * Subject naming rules shared by the server and the services.
 *
 * Channel names come from untrusted clients and are interpolated into NATS
 * subjects, so they are restricted to a single safe token: no dots (which would
 * let a client escape the `channel.` namespace) and no wildcards (`*` / `>`,
 * which would let a client subscribe to every channel at once).
 */

/** JetStream stream holding every `service.*` subject. */
export const SERVICES_STREAM = 'SERVICES';

/** Subjects captured by {@link SERVICES_STREAM}. */
export const SERVICES_SUBJECT_PREFIX = 'service';

/** Prefix for the ephemeral core-NATS subjects clients are fanned out on. */
export const CHANNEL_SUBJECT_PREFIX = 'channel';

const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

/** True when `name` is safe to interpolate into a subject as a single token. */
export const isValidToken = (name) => typeof name === 'string' && TOKEN.test(name);

/** `toto` -> `channel.toto` */
export const channelSubject = (name) => {
  if (!isValidToken(name)) throw new TypeError(`invalid channel name: ${JSON.stringify(name)}`);
  return `${CHANNEL_SUBJECT_PREFIX}.${name}`;
};

/** `happy` -> `service.happy` */
export const serviceSubject = (name) => {
  if (!isValidToken(name)) throw new TypeError(`invalid service name: ${JSON.stringify(name)}`);
  return `${SERVICES_SUBJECT_PREFIX}.${name}`;
};

/** True when `subject` is a fully-qualified, safe `channel.<token>` subject. */
export const isChannelSubject = (subject) =>
  typeof subject === 'string' &&
  subject.startsWith(`${CHANNEL_SUBJECT_PREFIX}.`) &&
  isValidToken(subject.slice(CHANNEL_SUBJECT_PREFIX.length + 1));

/**
 * JetStream durable names may not contain `.`, ` ` or `*`, so `service.happy`
 * becomes the durable `service_happy`.
 */
export const durableName = (subject) => subject.replaceAll('.', '_');
