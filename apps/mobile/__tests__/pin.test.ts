import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { checkPin, hasPin, savePin } from '../src/state/pin';

const SecureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

beforeEach(() => SecureStore.__reset());

describe('PIN storage', () => {
  it('stores only a salted hash and accepts the right PIN', async () => {
    expect(await hasPin()).toBe(false);
    await savePin('1234');
    expect(await hasPin()).toBe(true);
    expect(await checkPin('1234')).toEqual({ ok: true });
  });

  it('counts down attempts and resets them after a correct PIN', async () => {
    await savePin('1234');
    expect(await checkPin('0000')).toEqual({ ok: false, attemptsLeft: 4 });
    expect(await checkPin('1111')).toEqual({ ok: false, attemptsLeft: 3 });
    expect(await checkPin('1234')).toEqual({ ok: true });
    expect(await checkPin('0000')).toEqual({ ok: false, attemptsLeft: 4 });
  });

  it('reports 0 attempts left after 5 wrong PINs', async () => {
    await savePin('1234');
    let last = await checkPin('0000');
    for (let i = 0; i < 4; i++) last = await checkPin('0000');
    expect(last).toEqual({ ok: false, attemptsLeft: 0 });
  });
});
