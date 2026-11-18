import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoService } from './crypto.service';

const keys = {
  PII_ENC_KEY: randomBytes(32).toString('base64'),
  PII_HASH_KEY: randomBytes(32).toString('base64'),
};

describe('CryptoService', () => {
  const crypto = new CryptoService(keys);

  it('round-trips PII, including Cyrillic and Uzbek characters', () => {
    for (const value of ['+998901234567', 'Дильбар', 'Gʻulomjon Oʻrinov']) {
      expect(crypto.decrypt(crypto.encrypt(value))).toBe(value);
    }
  });

  it('uses a fresh IV so equal plaintexts give different ciphertexts', () => {
    const a = Buffer.from(crypto.encrypt('+998901234567'));
    const b = Buffer.from(crypto.encrypt('+998901234567'));
    expect(a.equals(b)).toBe(false);
  });

  it('rejects tampered ciphertext', () => {
    const payload = crypto.encrypt('+998901234567');
    payload[payload.length - 1] = payload[payload.length - 1]! ^ 0xff;
    expect(() => crypto.decrypt(payload)).toThrow();
  });

  it('rejects ciphertext from another key', () => {
    const other = new CryptoService({
      PII_ENC_KEY: randomBytes(32).toString('base64'),
      PII_HASH_KEY: keys.PII_HASH_KEY,
    });
    expect(() => other.decrypt(crypto.encrypt('x'))).toThrow();
  });

  it('hmac is deterministic and key-dependent', () => {
    expect(crypto.hmac('+998901234567')).toBe(crypto.hmac('+998901234567'));
    const other = new CryptoService({
      PII_ENC_KEY: keys.PII_ENC_KEY,
      PII_HASH_KEY: randomBytes(32).toString('base64'),
    });
    expect(other.hmac('+998901234567')).not.toBe(crypto.hmac('+998901234567'));
  });

  it('safeEqual compares without throwing on length mismatch', () => {
    expect(crypto.safeEqual('abc', 'abc')).toBe(true);
    expect(crypto.safeEqual('abc', 'abcd')).toBe(false);
  });
});
