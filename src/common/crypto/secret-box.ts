import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export const SECRET_KEY_BYTES = 32;

export function parseSecretKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== SECRET_KEY_BYTES) {
    throw new Error(`The key must be ${SECRET_KEY_BYTES} bytes in base64.`);
  }
  return key;
}

/** Returns `iv.tag.ciphertext` in base64url. The tag makes tampering detectable. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptSecret(encrypted: string, key: Buffer): string {
  const [iv, tag, ciphertext] = encrypted
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
