import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MainCollectionView } from '../../renderer/components/collections/MainCollectionComponent';
import { CollectionViewProps, MainColumnTitles, ModType } from '../../model';

function createProps(overrides: Partial<CollectionViewProps> = {}): CollectionViewProps {
	const rows = [
		{
			uid: 'workshop:3264187221',
			type: ModType.WORKSHOP,
			workshopID: BigInt(3264187221),
			id: 'HumanReadableModId',
			name: 'HHI Custom Paint GT',
			subscribed: true,
			installed: true
		}
	];

	return {
		rows,
		filteredRows: rows,
		collection: { name: 'default', mods: [rows[0].uid] },
		config: {},
		setEnabledModsCallback: vi.fn(),
		setEnabledCallback: vi.fn(),
		setDisabledCallback: vi.fn(),
		setMainColumnWidthCallback: vi.fn(),
		getModDetails: vi.fn(),
		...overrides
	};
}

describe('MainCollectionView', () => {
	it('shows the mod id in the Name column and the workshop id in the ID column', async () => {
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);

		render(<MainCollectionView {...createProps()} />);

		expect(await screen.findByText('3264187221')).toBeInTheDocument();
		expect(screen.getByText('HumanReadableModId')).toBeInTheDocument();
	});

	it('allows resizing a column and reports the persisted width', async () => {
		const ResizeObserverMock = vi.fn(function ResizeObserverMock() {
			return {
				observe: vi.fn(),
				disconnect: vi.fn()
			};
		});
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);

		const setMainColumnWidthCallback = vi.fn();

		render(
			<MainCollectionView
				{...createProps({
					setMainColumnWidthCallback
				})}
			/>
		);

		const resizeHandles = await screen.findAllByLabelText('Resize ID');
		resizeHandles.forEach((resizeHandle) => {
			fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
		});

		await waitFor(() => {
			expect(
				setMainColumnWidthCallback.mock.calls.some(
					([column, width]) => column === MainColumnTitles.ID && typeof width === 'number' && width >= 186
				)
			).toBe(true);
		});
	});
});
