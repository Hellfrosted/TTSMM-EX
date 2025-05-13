/* eslint-disable prettier/prettier */
module.exports = {
	extends: [
		'erb', 'airbnb-typescript'
	],
	plugins: ['@typescript-eslint'],
	rules: {
		// A temporary hack related to IDE not resolving correct package.json
		'import/no-extraneous-dependencies': 'off',
		'prettier/prettier': [
			'error',
			{
				singleQuote: true,
				trailingComma: 'none',
				tabWidth: 2,
				useTabs: true,
				printWidth: 140,
				bracketSameLine: false
			}
		],
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
		'react/no-unused-state': 'warn',
		'react/destructuring-assignment': 'warn',
		'react/no-access-state-in-setstate': 'warn',
		'react/no-direct-mutation-state': 'warn',
		'react/jsx-props-no-spreading': 'off',
		'promise/always-return': 'warn',
		'promise/catch-or-return': ['warn', { terminationMethod: ['catch', 'asCallback', 'finally'] }],
		'no-console': 'off',
		'@typescript-eslint/no-non-null-assertion': 'off',
		'class-methods-use-this': 'warn',
		'prefer-destructuring': 'warn',
		'react/require-default-props': 'off',
		'import/extensions': [
			'error',
			'ignorePackages',
			{
				'js': 'never',
				'jsx': 'never',
				'ts': 'never',
				'tsx': 'never'
			}
		],
		'camelcase': 'warn',
		'react/jsx-filename-extension': 'off',
		'react/prefer-stateless-function': 'off',
		'react/no-unstable-nested-components': 'warn',
		'react/no-this-in-sfc': 'warn',
		'react/no-unused-class-component-methods': 'warn',
		"no-shadow": "off",
		"@typescript-eslint/no-shadow": ["error"],
		'@typescript-eslint/indent': 'off',
		'@typescript-eslint/comma-dangle': ['off'],
		'@typescript-eslint/no-unused-vars': ['error', {
			"argsIgnorePattern": "^_",
			"varsIgnorePattern": "^_",
			"caughtErrorsIgnorePattern": "^_"
		}]
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: 'module',
		project: './tsconfig.json',
		tsconfigRootDir: __dirname
	},
	settings: {
		'import/resolver': {
			// See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
			node: {
				extensions: ['.js', '.jsx', '.ts', '.tsx'],
				moduleDirectory: ['node_modules', 'src/'],
			},
			webpack: {
				config: require.resolve('./.erb/configs/webpack.config.eslint.ts')
			},
			typescript: {},
		},
		'import/parsers': {
			'@typescript-eslint/parser': ['.ts', '.tsx']
		},
	}
};
