import { MAIN_DETAILS_OVERLAY_MIN_HEIGHT, MAIN_DETAILS_OVERLAY_MIN_WIDTH } from 'shared/main-collection-view-config';

export type HalfDetailsLayout = 'bottom' | 'side';

const MIN_SIDE_BY_SIDE_WIDTH = 1120;
const MIN_COLLECTION_TABLE_WIDTH = 640;
const MIN_COLLECTION_TABLE_HEIGHT = 320;

interface DetailsLayoutInput {
	contentSize: { width: number; height: number };
	preferredLayout: HalfDetailsLayout | undefined;
	draftSize: { layout: HalfDetailsLayout; size: number } | null;
	configuredWidth: number | undefined;
	configuredHeight: number | undefined;
	detailsOpen: boolean;
	bigDetails: boolean;
}

export function clampDetailsOverlaySize(size: number, min: number, max: number) {
	return Math.min(Math.max(min, max), Math.max(min, Math.round(size)));
}

export function getDetailsLayout({
	contentSize,
	preferredLayout,
	draftSize,
	configuredWidth,
	configuredHeight,
	detailsOpen,
	bigDetails
}: DetailsLayoutInput) {
	const sideEligible = contentSize.width >= MIN_SIDE_BY_SIDE_WIDTH;
	const automaticLayout = sideEligible && contentSize.width > contentSize.height * 1.45 ? 'side' : 'bottom';
	const halfDetailsLayout = preferredLayout === 'side' && !sideEligible ? 'bottom' : preferredLayout || automaticLayout;
	const showSideBySideDetails = detailsOpen && !bigDetails && halfDetailsLayout === 'side';
	const maxSideDetailsWidth = Math.max(MAIN_DETAILS_OVERLAY_MIN_WIDTH, contentSize.width - MIN_COLLECTION_TABLE_WIDTH);
	const automaticWidth = Math.min(
		maxSideDetailsWidth,
		Math.max(MAIN_DETAILS_OVERLAY_MIN_WIDTH, Math.min(Math.round(contentSize.width * 0.38), 680))
	);
	const width = draftSize?.layout === 'side' ? draftSize.size : (configuredWidth ?? automaticWidth);
	const sideDetailsWidth = showSideBySideDetails ? clampDetailsOverlaySize(width, MAIN_DETAILS_OVERLAY_MIN_WIDTH, maxSideDetailsWidth) : 0;
	const maxBottomDetailsHeight = Math.max(MAIN_DETAILS_OVERLAY_MIN_HEIGHT, contentSize.height - MIN_COLLECTION_TABLE_HEIGHT);
	const automaticHeight = Math.min(
		Math.max(MAIN_DETAILS_OVERLAY_MIN_HEIGHT, Math.round(contentSize.height * 0.36)),
		maxBottomDetailsHeight
	);
	const height = draftSize?.layout === 'bottom' ? draftSize.size : (configuredHeight ?? automaticHeight);
	const bottomDetailsHeight =
		detailsOpen && !bigDetails && !showSideBySideDetails
			? clampDetailsOverlaySize(height, MAIN_DETAILS_OVERLAY_MIN_HEIGHT, maxBottomDetailsHeight)
			: 0;
	return { halfDetailsLayout, showSideBySideDetails, sideDetailsWidth, bottomDetailsHeight, maxSideDetailsWidth, maxBottomDetailsHeight };
}
