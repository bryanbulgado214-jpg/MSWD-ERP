// Modern ESLint "flat config" — the current recommended format (ESLint 9+).
// Shared across every app/package in the monorepo. Prettier handles all
// stylistic formatting; ESLint is intentionally limited to code-quality
// and correctness rules (eslint-config-prettier disables any ESLint rule
// that would otherwise conflict with Prettier's formatting decisions).

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript's own compiler already checks for undefined identifiers, and
      // `no-undef` false-positives on type-only / global namespace references
      // (e.g. `React.CSSProperties` under the new JSX transform). Disabling it
      // for TS is the typescript-eslint-recommended configuration.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // NestJS resolves constructor-injected providers from *value* imports at
    // runtime (via emitDecoratorMetadata). `consistent-type-imports` would
    // autofix those to `import type`, which erases the class and breaks DI —
    // so disable it for the API. (The web app has no DI and keeps the rule.)
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  prettierConfig,
];
