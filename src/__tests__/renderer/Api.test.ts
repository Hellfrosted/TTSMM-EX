import { describe, expect, it } from 'vitest';

import { parseExtraLaunchParams } from '../../renderer/Api';

describe('renderer API helpers', () => {
	it('parses quoted additional launch arguments without splitting embedded spaces', () => {
		expect(parseExtraLaunchParams('  +foo   "bar baz" \'qux quux\' plain  ')).toEqual(['+foo', 'bar baz', 'qux quux', 'plain']);
	});
});
