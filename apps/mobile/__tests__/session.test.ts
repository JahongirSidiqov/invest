import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Server mode; local mode is covered in session-local.test.ts.
jest.mock('../src/config', () => ({ API_URL: 'http://test', LOCAL_MODE: false }));
import { savePin } from '../src/state/pin';
import { secure } from '../src/state/secure';
import { useSession } from '../src/state/session';

const SecureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

beforeEach(() => {
  SecureStore.__reset();
  useSession.setState({ stage: 'loading', accessToken: null, backgroundedAt: null });
});

describe('session stages', () => {
  it('starts at the language screen on first launch', async () => {
    await useSession.getState().hydrate();
    expect(useSession.getState().stage).toBe('welcome');
  });

  it('asks for login when a language is saved but there is no session', async () => {
    await secure.set('locale', 'uz');
    await useSession.getState().hydrate();
    expect(useSession.getState()).toMatchObject({ stage: 'login', locale: 'uz' });
  });

  it('locks a saved session behind the PIN', async () => {
    await secure.set('locale', 'ru');
    await secure.set('refreshToken', 'x'.repeat(43));
    await savePin('1234');
    await useSession.getState().hydrate();
    expect(useSession.getState().stage).toBe('locked');
  });

  it('drops a session that never got a PIN', async () => {
    await secure.set('locale', 'ru');
    await secure.set('refreshToken', 'x'.repeat(43));
    await useSession.getState().hydrate();
    expect(useSession.getState().stage).toBe('login');
    expect(await secure.get('refreshToken')).toBeNull();
  });

  it('new users go PIN -> onboarding, returning users go PIN -> app', async () => {
    const pair = {
      accessToken: 'a',
      accessTokenExpiresIn: 900,
      refreshToken: 'r'.repeat(43),
      refreshTokenExpiresIn: 2592000,
    };
    await useSession.getState().signedIn(pair, true);
    expect(useSession.getState().stage).toBe('pin-setup');
    useSession.getState().pinCreated();
    expect(useSession.getState().stage).toBe('onboarding');

    await useSession.getState().signedIn(pair, false);
    useSession.getState().pinCreated();
    expect(useSession.getState().stage).toBe('ready');
  });

  it('auto-locks after 5 minutes in the background', () => {
    const now = jest.spyOn(Date, 'now');
    useSession.setState({ stage: 'ready' });

    now.mockReturnValue(0);
    useSession.getState().onBackground();
    now.mockReturnValue(4 * 60 * 1000);
    useSession.getState().onForeground();
    expect(useSession.getState().stage).toBe('ready');

    now.mockReturnValue(10 * 60 * 1000);
    useSession.getState().onBackground();
    now.mockReturnValue(15 * 60 * 1000);
    useSession.getState().onForeground();
    expect(useSession.getState().stage).toBe('locked');
    now.mockRestore();
  });
});
