const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const jsxA11yPlugin = require('eslint-plugin-jsx-a11y');
const promisePlugin = require('eslint-plugin-promise');

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
		plugins: {
			'@typescript-eslint': tsPlugin,
			'react-hooks': reactHooksPlugin,
			'jsx-a11y': jsxA11yPlugin,
			promise: promisePlugin
		},
		rules: {
			...reactHooksPlugin.configs.flat.recommended.rules,
			...jsxA11yPlugin.flatConfigs.recommended.rules,
			...promisePlugin.configs['flat/recommended'].rules,
			'no-restricted-imports': [
				'error',
				{
					patterns: ['@mui/*/*/*', '!@mui/material/test-utils/*']
				}
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'promise/always-return': 'warn',
			'promise/catch-or-return': ['warn', { terminationMethod: ['catch', 'asCallback', 'finally'] }]
		}
	}
];
