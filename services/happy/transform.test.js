import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { happy } from './transform.js';

describe('happy', () => {
  it('appends a smiley', () => {
    assert.equal(happy('hello'), 'hello 🙂');
  });

  it('leaves an already-shouted message readable', () => {
    assert.equal(happy('HELLO'), 'HELLO 🙂');
  });
});
