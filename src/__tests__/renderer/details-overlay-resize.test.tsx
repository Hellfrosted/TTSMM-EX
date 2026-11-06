import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DetailsOverlayResizeHandle } from '../../renderer/views/CollectionView';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('details overlay resize', () => {
	it('does not persist a pending keyboard resize after reset', () => {
		vi.useFakeTimers();
		const onReset = vi.fn();
		const onResizeEnd = vi.fn();
		render(
			<DetailsOverlayResizeHandle
				layout="side"
				minSize={100}
				maxSize={600}
				size={300}
				onReset={onReset}
				onResize={vi.fn()}
				onResizeEnd={onResizeEnd}
			/>
		);
		const handle = screen.getByRole('separator', { name: 'Resize side details panel' });
		fireEvent.keyDown(handle, { key: 'ArrowLeft' });
		fireEvent.doubleClick(handle);
		act(() => vi.advanceTimersByTime(200));
		expect(onReset).toHaveBeenCalledOnce();
		expect(onResizeEnd).not.toHaveBeenCalled();
	});

	it('does not persist an earlier keyboard resize after mouse resizing', () => {
		vi.useFakeTimers();
		const onResizeEnd = vi.fn();
		render(
			<DetailsOverlayResizeHandle
				layout="side"
				minSize={100}
				maxSize={600}
				size={300}
				onReset={vi.fn()}
				onResize={vi.fn()}
				onResizeEnd={onResizeEnd}
			/>
		);
		const handle = screen.getByRole('separator', { name: 'Resize side details panel' });
		fireEvent.keyDown(handle, { key: 'ArrowLeft' });
		fireEvent.mouseDown(handle, { clientX: 100 });
		fireEvent.mouseMove(window, { clientX: 80 });
		fireEvent.mouseUp(window);
		act(() => vi.advanceTimersByTime(200));
		expect(onResizeEnd).toHaveBeenCalledTimes(1);
		expect(onResizeEnd).toHaveBeenCalledWith('side', 330);
	});
});
