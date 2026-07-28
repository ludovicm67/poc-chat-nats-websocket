import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { capslock } from './transform.js';

describe('capslock', () => {
  it('shouts the message', () => {
    assert.equal(capslock('hello'), 'HELLO');
  });

  it('leaves emoji alone', () => {
    assert.equal(capslock('hello 🙂'), 'HELLO 🙂');
  });

  it('coerces non-strings instead of throwing', () => {
    assert.equal(capslock(42), '42');
    assert.equal(capslock(undefined), 'UNDEFINED');
  });
});
