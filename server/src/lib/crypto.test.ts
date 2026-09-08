import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

import { encryptSecret, decryptSecret, encryptFields } from './crypto';

test('round-trips a plaintext secret through encrypt/decrypt', () => {
  const plain = 'sk_live_abcdEFGH12345_super_secret';
  const enc = encryptSecret(plain);
  assert.ok(enc.startsWith('enc:v1:'), 'encrypted value carries the version prefix');
  assert.notEqual(enc, plain, 'ciphertext must differ from plaintext');
  assert.equal(decryptSecret(enc), plain, 'decrypting recovers the original plaintext');
});

test('passes legacy (pre-encryption) plaintext values through unchanged', () => {
  const legacy = 'sk_live_this_was_never_encrypted';
  assert.equal(decryptSecret(legacy), legacy);
});

test('uses a random IV so identical plaintext yields different ciphertext each time', () => {
  const plain = 'razorpay_secret_xyz';
  const a = encryptSecret(plain);
  const b = encryptSecret(plain);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), plain);
  assert.equal(decryptSecret(b), plain);
});

test('rejects tampered ciphertext instead of silently returning garbage', () => {
  const enc = encryptSecret('some secret value');
  const tampered = enc.slice(0, -4) + 'AAAA';
  assert.throws(() => decryptSecret(tampered));
});

test('encryptFields only touches defined, non-empty string fields', () => {
  const input = { a: 'secret1', b: undefined, c: '' } as { a?: string; b?: string; c?: string };
  const out = encryptFields(input, ['a', 'b', 'c']);
  assert.ok(out.a!.startsWith('enc:v1:'));
  assert.equal(out.b, undefined);
  assert.equal(out.c, '');
});
