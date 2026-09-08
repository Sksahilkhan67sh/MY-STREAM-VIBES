import crypto from 'crypto';

/**
 * Field-level encryption for sensitive values stored at rest (payment
 * provider secret keys in DonationConfig — Stripe secret key, Stripe
 * webhook secret, Razorpay key secret). These were previously written to
 * the database as plain text.
 *
 * Format: `enc:v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>`
 *
 * decryptSecret() treats any value that does NOT match this format as a
 * legacy plaintext value and returns it unchanged. This means existing
 * rows written before this change keep working with no forced migration —
 * they simply get encrypted the next time the creator saves their config.
 */

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Set a 32-byte base64 key (e.g. `openssl rand -base64 32`) ' +
      'to encrypt payment-provider secrets before they are stored.'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}).`);
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM standard IV length
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) {
    // Legacy plaintext value written before field-level encryption existed.
    return value;
  }
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = value.slice(PREFIX.length).split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Encrypts only defined string values in an object, leaving others untouched. */
export function encryptFields<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): T {
  const out = { ...obj };
  for (const field of fields) {
    const val = out[field];
    if (typeof val === 'string' && val.length > 0) {
      out[field] = encryptSecret(val) as T[keyof T];
    }
  }
  return out;
}
