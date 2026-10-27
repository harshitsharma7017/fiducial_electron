// ESLint flat config for the product app. Mirrors the team's TypeScript repositories and adds
// security rules from M1: no sync safeStorage (AR-17) and no Node/Electron in the renderer.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // The M1 spike keeps its own toolchain and is not linted from here.
  globalIgnores(['node_modules/**', 'out/**', 'release/**', 'docs/**', 'spikes/**']),

  js.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    files: ['**/*.{ts,tsx,mts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // AR-17: the synchronous safeStorage API is deprecated in Electron 45 and removed in 46.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['isEncryptionAvailable', 'encryptString', 'decryptString'].map((property) => ({
          object: 'safeStorage',
          property,
          message: 'Use the async safeStorage API (removed synchronous methods in Electron 46).',
        })),
      ],
    },
  },

  // The renderer is untrusted: no Electron or Node modules, ever.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'electron', message: 'The renderer must use the preload bridge.' }],
          patterns: [
            { group: ['node:*'], message: 'No Node.js modules in the renderer.' },
            {
              group: ['**/main/**', '**/preload/**'],
              message: 'Renderer may import shared code only.',
            },
          ],
        },
      ],
    },
  },

  // Scripts and the main-process logger sink write to the console on purpose.
  {
    files: ['scripts/**/*.mjs', 'src/main/logging/console-sink.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['test/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },

  prettier,
]);
