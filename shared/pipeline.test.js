import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { dispatch, mapContent, route } from './pipeline.js';

const envelope = (overrides = {}) => ({
  channel: 'channel.toto',
  pipeline: ['capslock_mode'],
  content: { type: 'message', channel: 'toto', content: 'hello' },
  ...overrides,
});

describe('mapContent', () => {
  it('maps the inner content and leaves the envelope untouched', () => {
    const shout = mapContent((c) => String(c).toUpperCase());
    assert.deepEqual(shout({ type: 'message', channel: 'toto', content: 'hi' }), {
      type: 'message',
      channel: 'toto',
      content: 'HI',
    });
  });

  it('does not mutate its input', () => {
    const input = { content: 'hi' };
    mapContent((c) => `${c}!`)(input);
    assert.equal(input.content, 'hi');
  });
});

describe('route', () => {
  it('forwards to the next service while the pipeline is non-empty', () => {
    const action = route(envelope(), mapContent((c) => `${c} 🙂`));

    assert.equal(action.kind, 'forward');
    assert.equal(action.subject, 'service.capslock_mode');
    assert.deepEqual(JSON.parse(action.payload), {
      channel: 'channel.toto',
      pipeline: [],
      content: { type: 'message', channel: 'toto', content: 'hello 🙂' },
    });
  });

  it('pops exactly one service per hop', () => {
    const action = route(
      envelope({ pipeline: ['capslock_mode', 'other'] }),
      (message) => message,
    );

    assert.equal(action.subject, 'service.capslock_mode');
    assert.deepEqual(JSON.parse(action.payload).pipeline, ['other']);
  });

  it('delivers to the chat channel once the pipeline is exhausted', () => {
    const action = route(
      envelope({ pipeline: [] }),
      mapContent((c) => String(c).toUpperCase()),
    );

    assert.equal(action.kind, 'deliver');
    assert.equal(action.subject, 'channel.toto');
    assert.deepEqual(JSON.parse(action.payload), {
      type: 'message',
      channel: 'toto',
      content: 'HELLO',
    });
  });

  it('treats a missing pipeline as exhausted', () => {
    const { pipeline: _omitted, ...rest } = envelope();
    assert.equal(route(rest, (m) => m).kind, 'deliver');
  });

  it('applies the transform on the last hop too', () => {
    const action = route(envelope({ pipeline: [] }), mapContent((c) => `${c}!`));
    assert.equal(JSON.parse(action.payload).content, 'hello!');
  });

  it('rejects a channel outside the channel namespace', () => {
    assert.throws(
      () => route(envelope({ channel: 'service.happy' }), (m) => m),
      /invalid channel subject/,
    );
  });

  it('rejects a wildcard channel that would spam every subscriber', () => {
    assert.throws(() => route(envelope({ channel: 'channel.>' }), (m) => m), /invalid channel/);
  });

  it('rejects an unsafe service name in the pipeline', () => {
    assert.throws(
      () => route(envelope({ pipeline: ['../evil'] }), (m) => m),
      /invalid service name in pipeline/,
    );
  });

  it('rejects malformed envelopes', () => {
    assert.throws(() => route(null, (m) => m), /must be an object/);
    assert.throws(() => route('nope', (m) => m), /must be an object/);
    assert.throws(() => route([], (m) => m), /must be an object/);
    assert.throws(() => route(envelope({ pipeline: 'nope' }), (m) => m), /must be an array/);
  });
});

describe('dispatch', () => {
  it('publishes a deliver action on core NATS', async () => {
    const nc = { publish: mock.fn() };
    const js = { publish: mock.fn(async () => {}) };

    await dispatch({ nc, js }, { kind: 'deliver', subject: 'channel.toto', payload: '{}' });

    assert.equal(js.publish.mock.callCount(), 0);
    assert.deepEqual(nc.publish.mock.calls[0].arguments, ['channel.toto', '{}']);
  });

  it('publishes a forward action through JetStream for durability', async () => {
    const nc = { publish: mock.fn() };
    const js = { publish: mock.fn(async () => {}) };

    await dispatch({ nc, js }, { kind: 'forward', subject: 'service.happy', payload: '{}' });

    assert.equal(nc.publish.mock.callCount(), 0);
    assert.deepEqual(js.publish.mock.calls[0].arguments, ['service.happy', '{}']);
  });
});
