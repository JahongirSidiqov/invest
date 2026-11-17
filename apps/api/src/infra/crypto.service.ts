import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { ENV, type Env } from '../config/env';

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Field-level encryption for PII (AES-256-GCM) and keyed hashing for lookups.
 * Ciphertext layout: [version:1][iv:12][tag:16][ciphertext].
 */
@Injectable()
export class CryptoService {
  private readonly encKey: Buffer;
  private readonly hashKey: Buffer;

  constructor(@Inject(ENV) env: Pick<Env, 'PII_ENC_KEY' | 'PII_HASH_KEY'>) {
    this.encKey = Buffer.from(env.PII_ENC_KEY, 'base64');
    this.hashKey = Buffer.from(env.PII_HASH_KEY, 'base64');
  }

  encrypt(plaintext: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const out = Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
    return new Uint8Array(out);
  }

  decrypt(payload: Uint8Array): string {
    const buf = Buffer.from(payload);
    if (buf[0] !== VERSION) throw new Error('Unknown ciphertext version');
    const iv = buf.subarray(1, 1 + IV_LENGTH);
    const tag = buf.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const body = buf.subarray(1 + IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }

  /** Keyed hash for lookups (phone) and for keys that must not contain PII. */
  hmac(value: string): string {
    return createHmac('sha256', this.hashKey).update(value).digest('hex');
  }

  /** Unkeyed hash for high-entropy secrets such as refresh tokens. */
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }
}
