// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  // eslint-plugin-react's version auto-detection is not compatible with ESLint 10.
  { settings: { react: { version: '19.3' } } },
  { ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*'] },
]);
