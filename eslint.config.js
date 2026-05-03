import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.worktrees']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // The editor store uses TypeScript declaration merging: `EditorStore` is
      // declared as an empty interface in `src/core/editor-store/types.ts` and
      // each slice file augments it via
      //   declare module '@core/editor-store/types' {
      //     interface EditorStore extends MySlice {}
      //   }
      // That requires both the original empty interface AND each per-slice
      // empty-extends form. They are not redundant — the empty body is the
      // augmentation point, removing it would break the type. Allowlist the
      // one identifier this pattern uses, project-wide.
      '@typescript-eslint/no-empty-object-type': ['error', {
        allowWithName: '^EditorStore$',
      }],
    },
  },
  {
    files: ['src/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-constant-condition': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
])
