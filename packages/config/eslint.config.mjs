import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Shared flat config for Node packages. Apps extend it with their own globals. */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '**/generated/**', '**/*.d.ts'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': 'error',
    },
  },
);
