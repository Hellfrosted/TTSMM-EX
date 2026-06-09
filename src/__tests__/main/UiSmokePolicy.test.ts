import { describe, expect, it } from 'vitest';
import { isDialogTransitionRenderable, isRetriableCapturePageError, isToolbarDropdownRenderable } from '../../main/ui-smoke-policy';

describe('UI smoke policy', () => {
	it('accepts toolbar dropdowns that are already open when reduced motion makes the transition instant', () => {
		expect(
			isToolbarDropdownRenderable({
				startOpacity: '1',
				opacity: '1',
				pointerEvents: 'auto',
				transitionProperty: 'transform, opacity',
				transitionDuration: '0.001s'
			})
		).toBe(true);
	});

	it('rejects toolbar dropdowns that are still invisible after the transition wait', () => {
		expect(
			isToolbarDropdownRenderable({
				startOpacity: '0',
				opacity: '0',
				pointerEvents: 'none',
				transitionProperty: 'transform, opacity',
				transitionDuration: '0.16s'
			})
		).toBe(false);
	});

	it('treats Electron Viz capture failures as retryable screenshot failures', () => {
		expect(isRetriableCapturePageError(new Error('UnknownVizError'))).toBe(true);
		expect(isRetriableCapturePageError(new Error('permission denied'))).toBe(false);
	});

	it('waits for dialog transitions to leave their starting opacity', () => {
		expect(
			isDialogTransitionRenderable({
				overlayOpacity: '0',
				panelOpacity: '0',
				panelTransitionProperty: 'transform, opacity'
			})
		).toBe(false);
		expect(
			isDialogTransitionRenderable({
				overlayOpacity: '1',
				panelOpacity: '1',
				panelTransitionProperty: 'transform, opacity'
			})
		).toBe(true);
	});
});
