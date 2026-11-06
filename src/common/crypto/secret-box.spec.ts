import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, parseSecretKey } from './secret-box.js';

describe('secret box', () => {
  const key = randomBytes(32);

  it('round-trips and never contains the plaintext', () => {
    const encrypted = encryptSecret('123:secret-token', key);
    expect(encrypted).not.toContain('secret-token');
    expect(decryptSecret(encrypted, key)).toBe('123:secret-token');
  });

  it('uses a fresh IV every time', () => {
    expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key));
  });

  it('rejects a wrong key and tampered data', () => {
    const encrypted = encryptSecret('secret', key);
    expect(() => decryptSecret(encrypted, randomBytes(32))).toThrow();
    const [iv, tag] = encrypted.split('.');
    const forged = `${iv}.${tag}.${Buffer.from('forged').toString('base64url')}`;
    expect(() => decryptSecret(forged, key)).toThrow();
  });

  it('refuses a key of the wrong size', () => {
    expect(() => parseSecretKey('c2hvcnQ=')).toThrow();
    expect(parseSecretKey(key.toString('base64'))).toEqual(key);
  });
});
