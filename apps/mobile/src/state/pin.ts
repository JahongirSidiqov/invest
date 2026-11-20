import { PIN_MAX_ATTEMPTS } from '@invest/shared';
import * as Crypto from 'expo-crypto';
import { secure } from './secure';

/** The PIN never leaves the device; only a salted hash is kept in SecureStore. */
async function hash(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function savePin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  await secure.set('pinSalt', salt);
  await secure.set('pinHash', await hash(pin, salt));
  await secure.set('pinAttempts', '0');
}

export async function hasPin(): Promise<boolean> {
  return (await secure.get('pinHash')) !== null;
}

export type PinCheck = { ok: true } | { ok: false; attemptsLeft: number };

/** After PIN_MAX_ATTEMPTS wrong entries the caller must force an SMS login. */
export async function checkPin(pin: string): Promise<PinCheck> {
  const [stored, salt, attemptsRaw] = await Promise.all([
    secure.get('pinHash'),
    secure.get('pinSalt'),
    secure.get('pinAttempts'),
  ]);
  if (!stored || !salt) return { ok: false, attemptsLeft: 0 };
  if ((await hash(pin, salt)) === stored) {
    await secure.set('pinAttempts', '0');
    return { ok: true };
  }
  const attempts = Number(attemptsRaw ?? '0') + 1;
  await secure.set('pinAttempts', String(attempts));
  return { ok: false, attemptsLeft: Math.max(PIN_MAX_ATTEMPTS - attempts, 0) };
}

export const PIN_LOCKOUT_MS = 5 * 60 * 1000;

/** Local mode has no SMS fallback, so too many wrong PINs pause entry instead of wiping data. */
export async function startLockout(now = Date.now()): Promise<void> {
  await secure.set('pinLockedUntil', String(now + PIN_LOCKOUT_MS));
  await secure.set('pinAttempts', '0');
}

/** Milliseconds until PIN entry is allowed again; 0 when not locked out. */
export async function lockoutRemaining(now = Date.now()): Promise<number> {
  const until = Number((await secure.get('pinLockedUntil')) ?? '0');
  return Math.max(until - now, 0);
}
