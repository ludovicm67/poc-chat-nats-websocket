import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  channelSubject,
  durableName,
  isChannelSubject,
  isValidToken,
  serviceSubject,
} from './subjects.js';

describe('isValidToken', () => {
  it('accepts plain alphanumeric names', () => {
    for (const name of ['toto', 'Chan-1', 'a_b', 'A', '0']) {
      assert.equal(isValidToken(name), true, name);
    }
  });

  it('rejects NATS wildcards, which would escape the channel namespace', () => {
    for (const name of ['*', '>', 'a.*', 'a.>']) {
      assert.equal(isValidToken(name), false, name);
    }
  });

  it('rejects dots, spaces and empty names', () => {
    for (const name of ['a.b', 'a b', '', ' ']) {
      assert.equal(isValidToken(name), false, JSON.stringify(name));
    }
  });

  it('rejects non-strings', () => {
    for (const name of [null, undefined, 42, {}, ['a']]) {
      assert.equal(isValidToken(name), false, JSON.stringify(name));
    }
  });

  it('rejects names longer than 64 characters', () => {
    assert.equal(isValidToken('a'.repeat(64)), true);
    assert.equal(isValidToken('a'.repeat(65)), false);
  });
});

describe('channelSubject', () => {
  it('prefixes a valid channel name', () => {
    assert.equal(channelSubject('toto'), 'channel.toto');
  });

  it('throws on a name that would break out of the namespace', () => {
    assert.throws(() => channelSubject('>'), /invalid channel name/);
    assert.throws(() => channelSubject('a.b'), /invalid channel name/);
  });
});

describe('serviceSubject', () => {
  it('prefixes a valid service name', () => {
    assert.equal(serviceSubject('happy'), 'service.happy');
    assert.equal(serviceSubject('capslock_mode'), 'service.capslock_mode');
  });

  it('throws on an invalid service name', () => {
    assert.throws(() => serviceSubject('../evil'), /invalid service name/);
  });
});

describe('isChannelSubject', () => {
  it('accepts fully-qualified channel subjects', () => {
    assert.equal(isChannelSubject('channel.toto'), true);
  });

  it('rejects other namespaces and wildcards', () => {
    for (const subject of [
      'service.happy',
      'channel.*',
      'channel.>',
      'channel.a.b',
      'channel.',
      'channel',
      '',
      null,
    ]) {
      assert.equal(isChannelSubject(subject), false, JSON.stringify(subject));
    }
  });
});

describe('durableName', () => {
  it('replaces dots, which JetStream forbids in durable names', () => {
    assert.equal(durableName('service.happy'), 'service_happy');
    assert.equal(durableName('service.capslock_mode'), 'service_capslock_mode');
  });
});
