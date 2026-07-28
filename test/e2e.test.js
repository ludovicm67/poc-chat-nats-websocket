import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createChatServer } from '@poc/server/chat-server.js';
import { connectToNats, ensureServicesStream, runService, silentLogger } from '@poc/shared';
import { capslock } from '@poc/service-capslock-mode/transform.js';
import { happy } from '@poc/service-happy/transform.js';

import { dockerAvailable, startNatsContainer } from '../testing/nats-container.js';
import { openClient, settle } from '../testing/ws-client.js';

/**
 * Full-stack test: a real NATS server with JetStream, the real gateway, and
 * both pipeline services, driven through a real WebSocket connection.
 */
describe('chat end to end', { timeout: 120_000 }, async () => {
  const skip = process.env.NATS_TEST_URL ? false : !(await dockerAvailable());

  let container;
  let nc;
  let chat;
  let services = [];

  before(async () => {
    if (skip) return;

    container = await startNatsContainer();
    const servers = [container.url];

    nc = await connectToNats({ servers, name: 'test' });
    await ensureServicesStream(nc);

    chat = await createChatServer({ nc, port: 0, logger: silentLogger });

    services = await Promise.all([
      runService({
        transform: happy,
        channelName: 'service.happy',
        servers,
        logger: silentLogger,
      }),
      runService({
        transform: capslock,
        channelName: 'service.capslock_mode',
        servers,
        logger: silentLogger,
      }),
    ]);
  });

  after(async () => {
    if (skip) return;
    await Promise.all(services.map((s) => s.close()));
    await chat?.close();
    await nc?.drain();
    await container?.stop();
  });

  const skipOpts = { skip: skip && 'Docker is unavailable; set NATS_TEST_URL to run this suite' };

  it('answers health checks over plain HTTP', skipOpts, async () => {
    const res = await fetch(`http://127.0.0.1:${chat.port}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  it('broadcasts a join to everyone on the channel', skipOpts, async () => {
    const alice = await openClient(chat.port);
    const bob = await openClient(chat.port);

    alice.send({ type: 'join', channel: 'lobby', content: 'HELLO!' });
    await alice.waitFor((f) => f.type === 'join');

    bob.send({ type: 'join', channel: 'lobby', content: 'HELLO!' });
    // Alice was already subscribed, so she sees Bob arrive.
    const seen = await alice.waitFor(
      (f) => f.type === 'join' && alice.received.filter((m) => m.type === 'join').length >= 2,
    );

    assert.equal(seen.channel, 'lobby');

    await alice.close();
    await bob.close();
  });

  it('pushes a chat message through the whole service pipeline', skipOpts, async () => {
    const client = await openClient(chat.port);

    client.send({ type: 'join', channel: 'pipeline', content: 'HELLO!' });
    await client.waitFor((f) => f.type === 'join');

    client.send({ type: 'message', channel: 'pipeline', content: 'hello world' });

    const message = await client.waitFor((f) => f.type === 'message');

    // happy appends the smiley, then capslock_mode shouts the result.
    assert.equal(message.content, 'HELLO WORLD 🙂');
    assert.equal(message.channel, 'pipeline');

    await client.close();
  });

  it('delivers pipeline output to every subscriber of the channel', skipOpts, async () => {
    const alice = await openClient(chat.port);
    const bob = await openClient(chat.port);

    for (const c of [alice, bob]) {
      c.send({ type: 'join', channel: 'shared', content: 'HELLO!' });
      await c.waitFor((f) => f.type === 'join');
    }

    alice.send({ type: 'message', channel: 'shared', content: 'ping' });

    const [a, b] = await Promise.all([
      alice.waitFor((f) => f.type === 'message'),
      bob.waitFor((f) => f.type === 'message'),
    ]);

    assert.equal(a.content, 'PING 🙂');
    assert.equal(b.content, 'PING 🙂');

    await alice.close();
    await bob.close();
  });

  it('isolates channels from each other', skipOpts, async () => {
    const here = await openClient(chat.port);
    const elsewhere = await openClient(chat.port);

    here.send({ type: 'join', channel: 'here', content: 'HELLO!' });
    elsewhere.send({ type: 'join', channel: 'elsewhere', content: 'HELLO!' });
    await Promise.all([
      here.waitFor((f) => f.type === 'join'),
      elsewhere.waitFor((f) => f.type === 'join'),
    ]);

    here.send({ type: 'message', channel: 'here', content: 'secret' });
    await here.waitFor((f) => f.type === 'message');

    await settle();
    assert.equal(
      elsewhere.received.some((f) => f.type === 'message'),
      false,
      'a client in another channel must not see the message',
    );

    await here.close();
    await elsewhere.close();
  });

  it('ignores malformed frames without dropping the connection', skipOpts, async () => {
    const client = await openClient(chat.port);

    client.send({ type: 'join', channel: 'resilient', content: 'HELLO!' });
    await client.waitFor((f) => f.type === 'join');

    client.socket.send('not json at all');
    client.socket.send(JSON.stringify({ type: 'message' })); // no channel
    client.socket.send(JSON.stringify({ type: 'message', channel: '>' })); // wildcard
    client.socket.send(JSON.stringify([1, 2, 3]));

    // The connection still works afterwards.
    client.send({ type: 'message', channel: 'resilient', content: 'still here' });
    const message = await client.waitFor((f) => f.type === 'message');

    assert.equal(message.content, 'STILL HERE 🙂');
    assert.equal(client.socket.readyState, client.socket.OPEN);

    await client.close();
  });

  it('broadcasts unknown message types verbatim, bypassing the pipeline', skipOpts, async () => {
    const client = await openClient(chat.port);

    client.send({ type: 'join', channel: 'raw', content: 'HELLO!' });
    await client.waitFor((f) => f.type === 'join');

    client.send({ type: 'typing', channel: 'raw', content: 'someone' });

    const frame = await client.waitFor((f) => f.type === 'typing');
    assert.equal(frame.content, 'someone', 'no service should have transformed it');

    await client.close();
  });

  it('stops delivering to a client once it disconnects', skipOpts, async () => {
    const leaver = await openClient(chat.port);
    const stayer = await openClient(chat.port);

    for (const c of [leaver, stayer]) {
      c.send({ type: 'join', channel: 'cleanup', content: 'HELLO!' });
      await c.waitFor((f) => f.type === 'join');
    }

    await leaver.close();
    const receivedBefore = leaver.received.length;

    stayer.send({ type: 'message', channel: 'cleanup', content: 'after you left' });
    await stayer.waitFor((f) => f.type === 'message');

    await settle();
    assert.equal(leaver.received.length, receivedBefore);

    await stayer.close();
  });
});
