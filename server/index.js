import { connectToNats, createLogger, ensureServicesStream, parseServers } from '@poc/shared';

import { createChatServer } from './chat-server.js';

const logger = createLogger('server');
const port = Number(process.env.SERVER_PORT ?? 3001);
const servers = parseServers(process.env.NATS_SERVERS);

const nc = await connectToNats({ servers, name: 'server' });
logger.info(`connected to ${nc.getServer()}`);

// The server owns the stream the pipeline services consume from.
await ensureServicesStream(nc);

const chat = await createChatServer({ nc, port, logger });

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down`);
  await chat.close();
  await nc.drain();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
