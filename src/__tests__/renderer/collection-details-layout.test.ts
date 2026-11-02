import { describe, expect, it } from 'vitest';
import { MAIN_DETAILS_OVERLAY_MIN_HEIGHT, MAIN_DETAILS_OVERLAY_MIN_WIDTH } from '../../renderer/main-view-config-constants';
import { getDetailsLayout } from '../../renderer/views/collection-details-layout';

const input = {
	contentSize: { width: 1400, height: 800 },
	preferredLayout: undefined,
	draftSize: null,
	configuredWidth: undefined,
	configuredHeight: undefined,
	detailsOpen: true,
	bigDetails: false
};

describe('collection details layout', () => {
	it('chooses a side layout for a wide area and bounds its automatic size', () => {
		expect(getDetailsLayout(input)).toMatchObject({
			halfDetailsLayout: 'side',
			showSideBySideDetails: true,
			sideDetailsWidth: 532,
			bottomDetailsHeight: 0
		});
	});
	it('falls back to bottom when a preferred side layout is too narrow', () => {
		const layout = getDetailsLayout({ ...input, contentSize: { width: 1000, height: 800 }, preferredLayout: 'side' });
		expect(layout).toMatchObject({
			halfDetailsLayout: 'bottom',
			showSideBySideDetails: false,
			sideDetailsWidth: 0,
			bottomDetailsHeight: 288
		});
	});
	it('prefers the matching draft over persisted size and clamps it to the available area', () => {
		expect(getDetailsLayout({ ...input, configuredWidth: 500, draftSize: { layout: 'side', size: 5000 } }).sideDetailsWidth).toBe(760);
		expect(
			getDetailsLayout({ ...input, preferredLayout: 'bottom', configuredHeight: 400, draftSize: { layout: 'side', size: 600 } })
				.bottomDetailsHeight
		).toBe(400);
		expect(getDetailsLayout({ ...input, preferredLayout: 'bottom', draftSize: { layout: 'bottom', size: 1 } }).bottomDetailsHeight).toBe(
			MAIN_DETAILS_OVERLAY_MIN_HEIGHT
		);
	});
	it('keeps minimum bounds in small areas and hides half details when closed or expanded', () => {
		const small = getDetailsLayout({ ...input, contentSize: { width: 0, height: 0 } });
		expect(small.maxSideDetailsWidth).toBe(MAIN_DETAILS_OVERLAY_MIN_WIDTH);
		expect(small.bottomDetailsHeight).toBe(MAIN_DETAILS_OVERLAY_MIN_HEIGHT);
		for (const change of [{ detailsOpen: false }, { bigDetails: true }]) {
			expect(getDetailsLayout({ ...input, ...change })).toMatchObject({
				sideDetailsWidth: 0,
				bottomDetailsHeight: 0,
				showSideBySideDetails: false
			});
		}
	});
});
