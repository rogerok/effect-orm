import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import onlyWarn from 'eslint-plugin-only-warn';
import perfectionist from 'eslint-plugin-perfectionist';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import noComplexInlineType from './no-complex-inline-type.mjs';

const operationGroups = [
  'operation-create',
  'operation-get-all',
  'operation-get-by-id',
  'operation-update',
  'operation-delete',
];

const operationCustomGroups = [
  { groupName: 'operation-create', elementNamePattern: '^create$' },
  { groupName: 'operation-get-all', elementNamePattern: '^getAll$' },
  { groupName: 'operation-get-by-id', elementNamePattern: '^getById$' },
  { groupName: 'operation-update', elementNamePattern: '^update$' },
  { groupName: 'operation-delete', elementNamePattern: '^delete(?:ById)?$' },
];

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    plugins: {
      local: { rules: { 'no-complex-inline-type': noComplexInlineType } },
      onlyWarn,
    },
  },
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      'no-complex-inline-type.mjs',
    ],
  },
  {
    files: ['**/*.{ts,tsx,cts,mts,js,jsx,cjs,mjs}'],
    languageOptions: { globals: globals.node },
    plugins: { perfectionist },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'perfectionist/sort-enums': 'warn',
      'perfectionist/sort-exports': 'warn',
      'perfectionist/sort-imports': 'warn',
      'perfectionist/sort-interfaces': [
        'warn',
        { groups: ['required-property', 'optional-property'], order: 'asc' },
      ],
      'perfectionist/sort-intersection-types': 'warn',
      'perfectionist/sort-named-imports': 'warn',
      'perfectionist/sort-object-types': [
        'warn',
        { groups: ['required-property', 'optional-property'], order: 'asc' },
      ],
      'perfectionist/sort-union-types': [
        'warn',
        {
          groups: [
            'conditional',
            'function',
            'import',
            'intersection',
            'named',
            'object',
            'operator',
            'literal',
            'keyword',
            'tuple',
            'union',
            'nullish',
          ],
          order: 'asc',
          type: 'alphabetical',
        },
      ],
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-commented-code': 'warn',
      'sonarjs/no-dead-store': 'warn',
      'sonarjs/no-duplicated-branches': 'warn',
      'sonarjs/no-empty-test-file': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/todo-tag': 'off',
    },
  },
  {
    files: ['**/*.{ts,cts,mts}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { fixStyle: 'separate-type-imports', prefer: 'type-imports' },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx,cts,mts,js,jsx,cjs,mjs}'],
    rules: { 'sonarjs/no-hardcoded-passwords': 'off' },
  },
  {
    files: ['**/*.service.ts', '**/*.repository.ts'],
    rules: {
      'perfectionist/sort-interfaces': [
        'warn',
        {
          customGroups: operationCustomGroups,
          groups: [...operationGroups, 'unknown'],
          useConfigurationIf: {
            declarationMatchesPattern:
              '^[A-Za-z0-9_]+(?:Service|Repository)Shape$',
          },
        },
        { groups: ['required-property', 'optional-property'], order: 'asc' },
      ],
    },
  },
];
