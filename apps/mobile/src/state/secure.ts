import * as SecureStore from 'expo-secure-store';

/** Everything sensitive lives in the OS keystore, never in AsyncStorage. */
const KEYS = {
  refreshToken: 'refresh_token',
  pinHash: 'pin_hash',
  pinSalt: 'pin_salt',
  pinAttempts: 'pin_attempts',
  biometric: 'biometric_enabled',
  locale: 'locale',
} as const;

type Key = keyof typeof KEYS;

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secure = {
  get: (key: Key) => SecureStore.getItemAsync(KEYS[key], options),
  set: (key: Key, value: string) => SecureStore.setItemAsync(KEYS[key], value, options),
  remove: (key: Key) => SecureStore.deleteItemAsync(KEYS[key], options),
  async clearSession() {
    await Promise.all(
      (['refreshToken', 'pinHash', 'pinSalt', 'pinAttempts', 'biometric'] as const).map((k) =>
        SecureStore.deleteItemAsync(KEYS[k], options),
      ),
    );
  },
};
