import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../src/config', () => ({ API_URL: null, LOCAL_MODE: true }));

import { lockoutRemaining, PIN_LOCKOUT_MS, savePin, startLockout } from '../src/state/pin';
import { secure } from '../src/state/secure';
import { useSession } from '../src/state/session';

const SecureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

beforeEach(() => {
  SecureStore.__reset();
  useSession.setState({ stage: 'loading', accessToken: null, backgroundedAt: null });
});

describe('local mode (no server)', () => {
  it('goes from language choice straight to PIN setup, then onboarding', async () => {
    await useSession.getState().hydrate();
    expect(useSession.getState().stage).toBe('welcome');
    useSession.getState().goToLogin();
    expect(useSession.getState().stage).toBe('pin-setup');
    useSession.getState().pinCreated();
    expect(useSession.getState().stage).toBe('onboarding');
  });

  it('locks behind the PIN on the next start', async () => {
    await secure.set('locale', 'uz');
    await savePin('1234');
    await useSession.getState().hydrate();
    expect(useSession.getState().stage).toBe('locked');
  });

  it('pauses PIN entry for 5 minutes instead of wiping data', async () => {
    await startLockout(1_000);
    expect(await lockoutRemaining(1_000)).toBe(PIN_LOCKOUT_MS);
    expect(await lockoutRemaining(1_000 + PIN_LOCKOUT_MS)).toBe(0);
  });
});
