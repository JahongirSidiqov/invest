import base from '@invest/config/eslint';

export default [
  ...base,
  {
    // Nest injects by type; type-only imports would erase the injection token.
    files: ['src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
