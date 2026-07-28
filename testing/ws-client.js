import { once } from 'node:events';

import WebSocket from 'ws';

/**
 * A WebSocket client that buffers every frame it receives, so tests can assert
 * on messages that may arrive before they start waiting.
 */
export const openClient = async (port) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const received = [];
  const waiters = new Set();

  socket.on('message', (data) => {
    const frame = JSON.parse(data.toString('utf-8'));
    received.push(frame);
    for (const waiter of waiters) waiter(frame);
  });

  await once(socket, 'open');

  return {
    socket,
    received,

    send: (frame) => socket.send(JSON.stringify(frame)),

    /** Resolves with the first buffered or future frame matching `predicate`. */
    waitFor: (predicate, { timeout = 10_000 } = {}) =>
      new Promise((resolve, reject) => {
        const existing = received.find(predicate);
        if (existing) return resolve(existing);

        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(
            new Error(
              `timed out waiting for a matching frame; got ${JSON.stringify(received)}`,
            ),
          );
        }, timeout);

        const check = (frame) => {
          if (!predicate(frame)) return;
          clearTimeout(timer);
          waiters.delete(check);
          resolve(frame);
        };

        waiters.add(check);
      }),

    close: async () => {
      if (socket.readyState === WebSocket.CLOSED) return;
      socket.close();
      await once(socket, 'close');
    },
  };
};

/** Resolves after `ms`, used to assert that something did *not* arrive. */
export const settle = (ms = 750) => new Promise((resolve) => setTimeout(resolve, ms));
