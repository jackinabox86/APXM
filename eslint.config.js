import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'shell/**', 'packages/**', 'dist/**'],
  },
  js.configs.recommended,
  // React flat config (recommended + jsx-runtime for React 17+ JSX transform)
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Namespaces are used in the type declaration files for game API types
      '@typescript-eslint/no-namespace': 'off',

      // React
      'react/prop-types': 'off', // TypeScript handles this
      'react/display-name': 'warn',
      // useState(Date.now()) only evaluates the initializer once — not truly impure
      'react-hooks/purity': 'off',
      // setState inside useEffect is valid for syncing derived state from store changes
      'react-hooks/set-state-in-effect': 'off',

      // General
      // Disabled: TypeScript's compiler already catches undefined variables,
      // and no-undef produces false positives for type-level identifiers and
      // WXT build-time globals like __DEV__.
      'no-undef': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  // Node globals for Vite/WXT config files and test configs
  {
    files: ['*.config.ts', '*.config.cjs', '*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  prettierConfig,
];
