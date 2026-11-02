import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DetailCollapse } from '../../renderer/components/collections/mod-details-collapse';

afterEach(cleanup);

describe('DetailCollapse', () => {
	it('opens and closes sections independently', () => {
		render(
			<DetailCollapse
				defaultActiveKey={['first']}
				items={[
					{ key: 'first', label: 'First', children: 'First content' },
					{ key: 'second', label: 'Second', children: 'Second content' }
				]}
			/>
		);
		const first = screen.getByRole('button', { name: 'First' });
		const second = screen.getByRole('button', { name: 'Second' });
		expect(first).toHaveAttribute('aria-expanded', 'true');
		expect(second).toHaveAttribute('aria-expanded', 'false');
		fireEvent.click(second);
		fireEvent.click(first);
		expect(screen.queryByText('First content')).not.toBeInTheDocument();
		expect(screen.getByText('Second content')).toBeInTheDocument();
	});
});
