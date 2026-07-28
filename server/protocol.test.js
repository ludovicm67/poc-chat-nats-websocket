import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPipelineEnvelope, parseClientMessage } from './protocol.js';

describe('parseClientMessage', () => {
  it('accepts a well-formed frame', () => {
    const result = parseClientMessage('{"type":"message","channel":"toto","content":"hi"}');

    assert.equal(result.ok, true);
    assert.deepEqual(result.message, { type: 'message', channel: 'toto', content: 'hi' });
  });

  it('rejects non-JSON payloads', () => {
    const result = parseClientMessage('not json');
    assert.equal(result.ok, false);
    assert.match(result.reason, /not valid JSON/);
  });

  it('rejects JSON that is not an object', () => {
    for (const raw of ['"a string"', '42', 'null', '[1,2]']) {
      const result = parseClientMessage(raw);
      assert.equal(result.ok, false, raw);
      assert.match(result.reason, /not a JSON object/);
    }
  });

  it('rejects frames without a string type', () => {
    const result = parseClientMessage('{"channel":"toto"}');
    assert.equal(result.ok, false);
    assert.match(result.reason, /missing type/);
  });

  it('rejects channel names that would escape the subject namespace', () => {
    for (const channel of ['>', '*', 'a.b', 'a b', '']) {
      const raw = JSON.stringify({ type: 'join', channel });
      const result = parseClientMessage(raw);
      assert.equal(result.ok, false, channel);
      assert.match(result.reason, /invalid channel/);
    }
  });

  it('rejects a missing channel', () => {
    const result = parseClientMessage('{"type":"join"}');
    assert.equal(result.ok, false);
    assert.match(result.reason, /invalid channel/);
  });
});

describe('buildPipelineEnvelope', () => {
  it('wraps the client message with the remaining pipeline', () => {
    const message = { type: 'message', channel: 'toto', content: 'hi' };

    assert.deepEqual(
      buildPipelineEnvelope({
        channelSubject: 'channel.toto',
        message,
        pipeline: ['capslock_mode'],
      }),
      {
        pipeline: ['capslock_mode'],
        channel: 'channel.toto',
        content: message,
      },
    );
  });

  it('copies the pipeline so later hops cannot mutate the server default', () => {
    const pipeline = ['capslock_mode'];
    const envelope = buildPipelineEnvelope({
      channelSubject: 'channel.toto',
      message: {},
      pipeline,
    });

    envelope.pipeline.push('injected');
    assert.deepEqual(pipeline, ['capslock_mode']);
  });
});
