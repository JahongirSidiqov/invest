import { AUTO_LOCK_SECONDS, type Locale, type TokenPair } from '@invest/shared';
import { create } from 'zustand';
import i18n, { deviceLocale } from '../i18n';
import { hasPin } from './pin';
import { secure } from './secure';

export type Stage =
  | 'loading'
  | 'welcome' // pick language
  | 'login' // phone + OTP
  | 'pin-setup' // logged in, no PIN yet
  | 'onboarding' // PIN set, questions not answered
  | 'locked' // has a session, PIN or biometrics required
  | 'ready';

interface SessionState {
  stage: Stage;
  locale: Locale;
  /** Access token lives in memory only; the refresh token is in SecureStore. */
  accessToken: string | null;
  backgroundedAt: number | null;
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
  goToLogin: () => void;
  signedIn: (pair: TokenPair, needsOnboarding: boolean) => Promise<void>;
  setAccessToken: (token: string) => void;
  pinCreated: () => void;
  onboarded: () => void;
  unlocked: () => void;
  signOut: () => Promise<void>;
  onBackground: () => void;
  onForeground: () => void;
}

let needsOnboardingAfterPin = false;

export const useSession = create<SessionState>((set, get) => ({
  stage: 'loading',
  locale: deviceLocale(),
  accessToken: null,
  backgroundedAt: null,

  async hydrate() {
    const [savedLocale, refresh, pin] = await Promise.all([
      secure.get('locale'),
      secure.get('refreshToken'),
      hasPin(),
    ]);
    const locale = (savedLocale as Locale | null) ?? get().locale;
    await i18n.changeLanguage(locale);
    if (!savedLocale) return set({ stage: 'welcome', locale });
    if (!refresh) return set({ stage: 'login', locale });
    if (!pin) {
      // Session saved but the app closed before a PIN was set: log in again.
      await secure.clearSession();
      return set({ stage: 'login', locale });
    }
    set({ stage: 'locked', locale });
  },

  async setLocale(locale) {
    await secure.set('locale', locale);
    await i18n.changeLanguage(locale);
    set({ locale });
  },

  goToLogin: () => set({ stage: 'login' }),

  async signedIn(pair, needsOnboarding) {
    await secure.set('refreshToken', pair.refreshToken);
    needsOnboardingAfterPin = needsOnboarding;
    set({ accessToken: pair.accessToken, stage: 'pin-setup' });
  },

  setAccessToken: (accessToken) => set({ accessToken }),
  pinCreated: () => set({ stage: needsOnboardingAfterPin ? 'onboarding' : 'ready' }),
  onboarded: () => set({ stage: 'ready' }),
  unlocked: () => set({ stage: 'ready' }),

  async signOut() {
    // Local records belong to this user only. Dynamic import avoids a module cycle.
    const { resetLocalRecords } = await import('../records');
    await resetLocalRecords();
    await secure.clearSession();
    set({ accessToken: null, stage: 'login' });
  },

  onBackground: () => set({ backgroundedAt: Date.now() }),

  onForeground() {
    const { backgroundedAt, stage } = get();
    set({ backgroundedAt: null });
    if (stage !== 'ready' || backgroundedAt === null) return;
    if (Date.now() - backgroundedAt >= AUTO_LOCK_SECONDS * 1000) set({ stage: 'locked' });
  },
}));
