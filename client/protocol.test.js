import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildOutgoing,
  channelFromHash,
  DEFAULT_CHANNEL,
  describe as describeMessage,
  parseIncoming,
  resolveWebSocketUrl,
} from './protocol.js';

describe('channelFromHash', () => {
  it('strips the leading hash', () => {
    assert.equal(channelFromHash('#titi'), 'titi');
  });

  it('falls back to the default channel when there is no hash', () => {
    assert.equal(channelFromHash(''), DEFAULT_CHANNEL);
    assert.equal(channelFromHash('#'), DEFAULT_CHANNEL);
    assert.equal(channelFromHash(undefined), DEFAULT_CHANNEL);
  });
});

describe('buildOutgoing', () => {
  it('produces the frame the gateway expects', () => {
    assert.deepEqual(JSON.parse(buildOutgoing('message', 'toto', 'hi')), {
      type: 'message',
      channel: 'toto',
      content: 'hi',
    });
  });
});

describe('parseIncoming', () => {
  it('parses a valid frame', () => {
    assert.deepEqual(parseIncoming('{"type":"message","content":"hi"}'), {
      type: 'message',
      content: 'hi',
    });
  });

  it('returns null instead of throwing on junk', () => {
    // The old client called JSON.parse directly, so a non-JSON broadcast threw
    // inside onmessage.
    for (const raw of ['Hello World!', '', '[1,2]', 'null', '{"no":"type"}']) {
      assert.equal(parseIncoming(raw), null, JSON.stringify(raw));
    }
  });
});

describe('describe', () => {
  it('renders joins and messages', () => {
    assert.equal(describeMessage({ type: 'join' }), 'Someone joined the channel!');
    assert.equal(describeMessage({ type: 'message', content: 'HI 🙂' }), 'someone: HI 🙂');
  });

  it('ignores unknown frame types', () => {
    assert.equal(describeMessage({ type: 'other' }), null);
    assert.equal(describeMessage(null), null);
  });
});

describe('resolveWebSocketUrl', () => {
  it('prefers the configured URL', () => {
    assert.equal(
      resolveWebSocketUrl('ws://example.test:3001', { protocol: 'http:', hostname: 'x' }),
      'ws://example.test:3001',
    );
  });

  it('derives ws:// from an http page', () => {
    assert.equal(
      resolveWebSocketUrl('', { protocol: 'http:', hostname: 'localhost' }),
      'ws://localhost:3001',
    );
  });

  it('derives wss:// from an https page', () => {
    assert.equal(
      resolveWebSocketUrl('', { protocol: 'https:', hostname: 'chat.example' }),
      'wss://chat.example:3001',
    );
  });
});
