import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildOutgoing,
  channelFromHash,
  DEFAULT_CHANNEL,
  formatTime,
  parseIncoming,
  resolveWebSocketUrl,
  senderHue,
  senderLabel,
  toDisplayMessage,
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
    assert.deepEqual(JSON.parse(buildOutgoing('message', 'toto', 'hi', 'me')), {
      type: 'message',
      channel: 'toto',
      content: 'hi',
      sender: 'me',
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
    for (const raw of ['Hello World!', '', '[1,2]', 'null', '{"no":"type"}']) {
      assert.equal(parseIncoming(raw), null, JSON.stringify(raw));
    }
  });
});

describe('senderLabel', () => {
  it('shortens an opaque id to something readable', () => {
    assert.equal(senderLabel('9f3c1d2e-aaaa-bbbb-cccc-ddddeeeeffff'), '9f3c');
  });

  it('falls back for a missing id', () => {
    assert.equal(senderLabel(undefined), 'anon');
    assert.equal(senderLabel(''), 'anon');
    assert.equal(senderLabel(42), 'anon');
  });
});

describe('senderHue', () => {
  it('is stable for the same id', () => {
    assert.equal(senderHue('abc'), senderHue('abc'));
  });

  it('stays within a valid hue range', () => {
    for (const id of ['a', 'someone-else', '', '9f3c1d2e-aaaa']) {
      const hue = senderHue(id);
      assert.ok(hue >= 0 && hue < 360, `${id} -> ${hue}`);
    }
  });

  it('separates different senders', () => {
    assert.notEqual(senderHue('alice'), senderHue('bob'));
  });
});

describe('formatTime', () => {
  it('pads to HH:MM', () => {
    assert.equal(formatTime(new Date(2026, 0, 2, 9, 5)), '09:05');
    assert.equal(formatTime(new Date(2026, 0, 2, 23, 59)), '23:59');
  });
});

describe('toDisplayMessage', () => {
  it('renders someone else’s message', () => {
    const view = toDisplayMessage(
      { type: 'message', content: 'HI 🙂', sender: 'abcd-1234' },
      'me',
    );

    assert.equal(view.kind, 'message');
    assert.equal(view.text, 'HI 🙂');
    assert.equal(view.isOwn, false);
    assert.equal(view.label, 'abcd');
  });

  it('recognises your own message', () => {
    const view = toDisplayMessage({ type: 'message', content: 'HI', sender: 'me' }, 'me');

    assert.equal(view.isOwn, true);
    assert.equal(view.label, 'You');
  });

  it('never claims a frame without a sender is yours', () => {
    const view = toDisplayMessage({ type: 'message', content: 'HI' }, 'me');
    assert.equal(view.isOwn, false);
    assert.equal(view.label, 'anon');
  });

  it('renders joins as notices', () => {
    assert.deepEqual(toDisplayMessage({ type: 'join', sender: 'me' }, 'me'), {
      kind: 'notice',
      text: 'You joined the channel',
    });
    assert.match(
      toDisplayMessage({ type: 'join', sender: 'abcd-1234' }, 'me').text,
      /^abcd joined/,
    );
  });

  it('ignores unknown frame types', () => {
    assert.equal(toDisplayMessage({ type: 'typing' }, 'me'), null);
    assert.equal(toDisplayMessage(null, 'me'), null);
  });

  it('coerces a non-string body instead of throwing', () => {
    assert.equal(toDisplayMessage({ type: 'message', content: 42 }, 'me').text, '42');
    assert.equal(toDisplayMessage({ type: 'message' }, 'me').text, '');
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
