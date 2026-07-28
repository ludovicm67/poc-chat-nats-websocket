import { jetstream, jetstreamManager } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';

import { SERVICES_STREAM, SERVICES_SUBJECT_PREFIX } from './subjects.js';

/** Parses the `NATS_SERVERS` env var (comma separated) into a server list. */
export const parseServers = (value) =>
  (value ?? 'nats://localhost:4222')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Connects to NATS, retrying forever. Containers routinely start before the
 * broker is reachable, so `waitOnFirstConnect` is what keeps compose from
 * crash-looping the services.
 */
export const connectToNats = ({ servers, name }) =>
  connect({
    servers,
    name,
    waitOnFirstConnect: true,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 1000,
  });

/**
 * Creates the JetStream stream backing every `service.*` subject.
 *
 * Idempotent, so the server and each service can all call it on boot without
 * caring who wins the race.
 */
export const ensureServicesStream = async (nc) => {
  const jsm = await jetstreamManager(nc);
  return jsm.streams.add({
    name: SERVICES_STREAM,
    subjects: [`${SERVICES_SUBJECT_PREFIX}.>`],
  });
};

export { jetstream, jetstreamManager };
