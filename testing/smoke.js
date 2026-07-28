/**
 * Smoke check against an already-running stack (`docker compose up`).
 *
 * The unit and end-to-end suites exercise the source directly; this one drives
 * the actual built images through the published ports, so it catches
 * Dockerfile, compose and entrypoint regressions that the other suites cannot.
 *
 *   docker compose up -d --wait
 *   node testing/smoke.js
 */
import assert from 'node:assert/strict';

import { openClient } from './ws-client.js';

const wsPort = process.env.SMOKE_WS_PORT ?? '3001';
const httpPort = process.env.SMOKE_HTTP_PORT ?? '3000';

const check = async (label, fn) => {
  process.stdout.write(`• ${label} ... `);
  await fn();
  console.log('ok');
};

try {
  await check('gateway answers health checks', async () => {
    const res = await fetch(`http://127.0.0.1:${wsPort}/healthz`);
    assert.equal(res.status, 200);
  });

  await check('client serves the page and its generated config', async () => {
    const page = await fetch(`http://127.0.0.1:${httpPort}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<script type="module" src="app\.js">/);

    const config = await fetch(`http://127.0.0.1:${httpPort}/config.js`);
    assert.equal(config.status, 200);
    assert.match(await config.text(), /export const WEBSOCKET_URL = '.*'/);
  });

  await check('a message travels through the full service pipeline', async () => {
    const alice = await openClient(wsPort);
    const bob = await openClient(wsPort);

    for (const client of [alice, bob]) {
      client.send({ type: 'join', channel: 'smoke', content: 'HELLO!' });
      await client.waitFor((f) => f.type === 'join');
    }

    alice.send({ type: 'message', channel: 'smoke', content: 'hello from ci' });

    const [a, b] = await Promise.all([
      alice.waitFor((f) => f.type === 'message'),
      bob.waitFor((f) => f.type === 'message'),
    ]);

    // happy appends the smiley, capslock_mode shouts the result.
    assert.equal(a.content, 'HELLO FROM CI 🙂');
    assert.equal(b.content, 'HELLO FROM CI 🙂');

    await alice.close();
    await bob.close();
  });

  console.log('\nsmoke check passed');
  process.exit(0);
} catch (err) {
  console.error('\nsmoke check failed:', err.message);
  process.exit(1);
}
