import { parseServers, runService } from '@poc/shared';

import { capslock } from './transform.js';

await runService({
  transform: capslock,
  channelName: process.env.CHANNEL_NAME ?? 'service.capslock_mode',
  servers: parseServers(process.env.NATS_SERVERS),
});
