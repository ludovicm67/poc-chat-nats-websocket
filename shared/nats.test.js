import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseServers } from './nats.js';

describe('parseServers', () => {
  it('falls back to localhost when unset', () => {
    assert.deepEqual(parseServers(undefined), ['nats://localhost:4222']);
    assert.deepEqual(parseServers(null), ['nats://localhost:4222']);
  });

  it('splits a comma separated list', () => {
    assert.deepEqual(parseServers('nats://a:4222,nats://b:4222'), [
      'nats://a:4222',
      'nats://b:4222',
    ]);
  });

  it('trims whitespace and drops empty entries', () => {
    assert.deepEqual(parseServers(' nats://a:4222 , , nats://b:4222 '), [
      'nats://a:4222',
      'nats://b:4222',
    ]);
  });
});
