import { parseServers, runService } from '@poc/shared';

import { happy } from './transform.js';

await runService({
  transform: happy,
  channelName: process.env.CHANNEL_NAME ?? 'service.happy',
  servers: parseServers(process.env.NATS_SERVERS),
});
