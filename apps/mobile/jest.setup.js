const { jest } = require('@jest/globals');

// In-memory SecureStore for tests.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key) => void store.delete(key)),
    __reset: () => store.clear(),
  };
});

jest.mock('expo-crypto', () => {
  const { createHash, randomUUID } = require('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_alg, data) => createHash('sha256').update(data).digest('hex'),
    randomUUID,
  };
});

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'ru' }] }));
