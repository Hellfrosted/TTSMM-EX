const js = require('@eslint/js');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const jsxA11yPlugin = require('eslint-plugin-jsx-a11y');
const promisePlugin = require('eslint-plugin-promise');
const importPlugin = require('eslint-plugin-import');
const packageJson = require('./package.json');

const reactVersion = packageJson.dependencies?.react?.replace(/^[^\d]*/, '') || 'detect';

module.exports = [
	{
		ignores: [
			'logs/**',
			'coverage/**',
			'node_modules/**',
			'release/**',
			'assets/**',
			'.idea/**',
			'*.css.d.ts',
			'*.sass.d.ts',
			'*.scss.d.ts',
			'eslint.config.cjs'
		]
	},
	js.configs.recommended,
	...tsPlugin.configs['flat/recommended'],
	importPlugin.flatConfigs.recommended,
	importPlugin.flatConfigs.typescript,
	{
		...reactPlugin.configs.flat.recommended,
		settings: {
			...reactPlugin.configs.flat.recommended.settings,
			react: {
				version: reactVersion
			}
		}
	},
	{
		...reactPlugin.configs.flat['jsx-runtime'],
		settings: {
			...reactPlugin.configs.flat['jsx-runtime'].settings,
			react: {
				version: reactVersion
			}
		}
	},
	reactHooksPlugin.configs.flat.recommended,
	jsxA11yPlugin.flatConfigs.recommended,
	promisePlugin.configs['flat/recommended'],
	{
		files: ['**/*.{js,jsx,ts,tsx}'],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: 'module',
			parserOptions: {
				ecmaFeatures: {
					jsx: true
				}
			},
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2021
			}
		},
		settings: {
			react: {
				version: reactVersion
			},
			'import/core-modules': ['electron/main', 'electron/common', 'electron/renderer'],
			'import/resolver': {
				node: true,
				typescript: {
					project: ['./tsconfig.renderer.json', './tsconfig.main.json', './tsconfig.preload.json'],
					noWarnOnMultipleProjects: true
				}
			}
		},
		rules: {
			'import/no-extraneous-dependencies': 'off',
			'no-restricted-imports': [
				'error',
				{
					patterns: ['@mui/*/*/*', '!@mui/material/test-utils/*']
				}
			],
			'comma-dangle': ['error', 'never'],
			'max-len': [
				'warn',
				{
					code: 180,
					ignoreComments: true,
					ignoreUrls: true,
					ignoreTrailingComments: true
				}
			],
			'react/no-unused-state': 'off',
			'react/destructuring-assignment': 'warn',
			'react/no-access-state-in-setstate': 'warn',
			'react/no-direct-mutation-state': 'warn',
			'react/jsx-props-no-spreading': 'off',
			'promise/always-return': 'warn',
			'promise/catch-or-return': ['warn', { terminationMethod: ['catch', 'asCallback', 'finally'] }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-var-requires': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/no-require-imports': 'off',
			'@typescript-eslint/no-unsafe-function-type': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			'no-console': 'off',
			'class-methods-use-this': 'warn',
			'prefer-destructuring': 'warn',
			'react/require-default-props': 'off',
			'import/extensions': 'off',
			'import/no-import-module-exports': 'off',
			'react/function-component-definition': 'off',
			'react/jsx-filename-extension': 'off',
			'react/react-in-jsx-scope': 'off',
			'react/no-this-in-sfc': 'off',
			'react/no-unstable-nested-components': 'off',
			'react/no-unused-class-component-methods': 'off',
			'react/display-name': 'off',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			camelcase: 'off',
			'no-shadow': 'off',
			'@typescript-eslint/no-shadow': 'off',
			'no-use-before-define': 'off',
			'@typescript-eslint/no-use-before-define': 'off',
			'no-promise-executor-return': 'off'
		}
	}
];
