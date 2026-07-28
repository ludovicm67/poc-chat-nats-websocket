import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import { connect } from '@nats-io/transport-node';

const execFile = promisify(execFileCb);

const IMAGE = 'nats:2.14-alpine';
const CONTAINER = 'poc-chat-nats-websocket-test';

const docker = (args) => execFile('docker', args);

/** True when a working Docker daemon is reachable. */
export const dockerAvailable = async () => {
  try {
    await docker(['info']);
    return true;
  } catch {
    return false;
  }
};

const waitUntilReady = async (url, attempts = 60) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const nc = await connect({ servers: [url], maxReconnectAttempts: 1 });
      await nc.close();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`NATS at ${url} did not become ready`);
};

/**
 * Starts a throwaway JetStream-enabled NATS server in Docker on a random free
 * port and waits until it accepts connections.
 *
 * Set `NATS_TEST_URL` to run the suite against an already-running server
 * instead (for example the one from `docker compose up`).
 *
 * @returns {Promise<{url: string, stop: () => Promise<void>}>}
 */
export const startNatsContainer = async () => {
  if (process.env.NATS_TEST_URL) {
    const url = process.env.NATS_TEST_URL;
    await waitUntilReady(url);
    return { url, stop: async () => {} };
  }

  // Leftover from an interrupted run.
  await docker(['rm', '-f', CONTAINER]).catch(() => {});

  await docker([
    'run',
    '-d',
    '--name',
    CONTAINER,
    // Port 0 lets Docker pick a free host port, so concurrent runs and a
    // running compose stack cannot collide.
    '-p',
    '0:4222',
    IMAGE,
    '--jetstream',
    '--store_dir=/tmp/jetstream',
  ]);

  const { stdout } = await docker(['port', CONTAINER, '4222/tcp']);
  const port = stdout.trim().split('\n')[0].split(':').pop();
  const url = `nats://127.0.0.1:${port}`;

  await waitUntilReady(url);

  return {
    url,
    stop: async () => {
      await docker(['rm', '-f', CONTAINER]).catch(() => {});
    },
  };
};
