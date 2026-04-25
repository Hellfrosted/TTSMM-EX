import { memo, useMemo } from 'react';

const ATTRIBUTE_ESCAPE_MAP: Record<string, string> = {
	'&': '&amp;',
	'"': '&quot;',
	"'": '&#39;',
	'<': '&lt;',
	'>': '&gt;'
};

const TEXT_ESCAPE_MAP: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;'
};

const GENERIC_IMAGE_LABEL_WORDS = new Set([
	'image',
	'img',
	'screenshot',
	'screen',
	'preview',
	'title',
	'banner',
	'hero',
	'page',
	'final',
	'draft',
	'copy',
	'shot',
	'photo',
	'picture',
	'pic',
	'workshop',
	'steam',
	'updated',
	'update',
	'new'
]);

const DEFAULT_WORKSHOP_DESCRIPTION_IMAGE_ALT = 'Workshop description image';

function escapeText(value: string): string {
	return value.replace(/[&<>]/g, (character) => TEXT_ESCAPE_MAP[character] || character);
}

function escapeAttribute(value: string): string {
	return value.replace(/[&"'<>]/g, (character) => ATTRIBUTE_ESCAPE_MAP[character] || character);
}

function decodeEntities(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function sanitizeUrl(value: string): string | undefined {
	const trimmedValue = decodeEntities(value).trim();
	if (!trimmedValue) {
		return undefined;
	}

	try {
		const parsed = new URL(trimmedValue, 'https://steamcommunity.com/');
		if (!['http:', 'https:', 'steam:'].includes(parsed.protocol)) {
			return undefined;
		}
		return escapeAttribute(trimmedValue);
	} catch {
		return undefined;
	}
}

function deriveImageAltText(value: string, fallbackAltText: string): string {
	const trimmedValue = decodeEntities(value).trim();
	if (!trimmedValue) {
		return escapeAttribute(fallbackAltText);
	}

	try {
		const parsed = new URL(trimmedValue, 'https://steamcommunity.com/');
		const pathSegments = parsed.pathname.split('/').filter(Boolean);
		const lastSegment = pathSegments.at(-1);
		if (!lastSegment) {
			return escapeAttribute(fallbackAltText);
		}

		const normalizedLabel = decodeURIComponent(lastSegment)
			.replace(/\.[a-z0-9]+$/i, '')
			.replace(/[-_]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (!normalizedLabel) {
			return escapeAttribute(fallbackAltText);
		}

		const collapsedAlphaNumeric = normalizedLabel.replace(/[^a-z0-9]/gi, '');
		if (collapsedAlphaNumeric.length < 3 || /^\d+$/.test(collapsedAlphaNumeric) || /^[a-f0-9]{8,}$/i.test(collapsedAlphaNumeric)) {
			return escapeAttribute(fallbackAltText);
		}

		const normalizedWords = normalizedLabel
			.toLowerCase()
			.split(' ')
			.map((word) => word.replace(/[^a-z0-9]/gi, ''))
			.filter(Boolean);
		const meaningfulWords = normalizedWords.filter((word) => word.length > 2 && !GENERIC_IMAGE_LABEL_WORDS.has(word));
		if (meaningfulWords.length < 2) {
			return escapeAttribute(fallbackAltText);
		}

		return escapeAttribute(normalizedLabel.toLowerCase());
	} catch {
		return escapeAttribute(fallbackAltText);
	}
}

function replaceLoop(value: string, replacer: (input: string) => string): string {
	let previousValue = value;
	let nextValue = replacer(value);
	while (nextValue !== previousValue) {
		previousValue = nextValue;
		nextValue = replacer(nextValue);
	}
	return nextValue;
}

function normalizeLineBreaks(value: string): string {
	return value.replace(/\r\n?/g, '\n');
}

function renderEscapedWorkshopMarkup(value: string, imageAltFallback: string): string {
	let renderedValue = value;

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[noparse\]([\s\S]*?)\[\/noparse\]/gi, (_match, content: string) => content)
	);

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[list(?:=([^\]]+))?\]([\s\S]*?)\[\/list\]/gi, (_match, type: string | undefined, content: string) => {
			const tagName = type?.trim() === '1' ? 'ol' : 'ul';
			const rawItems = content
				.split(/\[\*\]/i)
				.map((item) => item.trim())
				.filter(Boolean);
			if (rawItems.length === 0) {
				return `<${tagName}><li>${renderEscapedWorkshopMarkup(content.trim(), imageAltFallback)}</li></${tagName}>`;
			}

			const items = rawItems.map((item) => `<li>${renderEscapedWorkshopMarkup(item, imageAltFallback)}</li>`).join('');
			return `<${tagName}>${items}</${tagName}>`;
		})
	);

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_match, content: string) => {
			const imageSource = sanitizeUrl(content);
			if (!imageSource) {
				return renderEscapedWorkshopMarkup(content.trim(), imageAltFallback);
			}

			const imageAltText = deriveImageAltText(content, imageAltFallback);
			return `<img src="${imageSource}" alt="${imageAltText}" loading="lazy" decoding="async" />`;
		})
	);

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_match, href: string, content: string) => {
			const sanitizedUrl = sanitizeUrl(href);
			const linkBody = renderEscapedWorkshopMarkup(content.trim(), imageAltFallback);
			if (!sanitizedUrl) {
				return linkBody;
			}

			return `<a href="${sanitizedUrl}" target="_blank" rel="noreferrer noopener">${linkBody}</a>`;
		})
	);

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_match, content: string) => {
			const sanitizedUrl = sanitizeUrl(content);
			const linkBody = renderEscapedWorkshopMarkup(content.trim(), imageAltFallback);
			if (!sanitizedUrl) {
				return linkBody;
			}

			return `<a href="${sanitizedUrl}" target="_blank" rel="noreferrer noopener">${linkBody}</a>`;
		})
	);

	const pairedTags: Array<[string, string]> = [
		['h1', 'h1'],
		['h2', 'h2'],
		['h3', 'h3'],
		['b', 'strong'],
		['i', 'em'],
		['u', 'u'],
		['s', 's'],
		['strike', 's'],
		['quote', 'blockquote']
	];

	pairedTags.forEach(([bbCodeTag, htmlTag]) => {
		renderedValue = replaceLoop(renderedValue, (currentValue) =>
			currentValue.replace(new RegExp(`\\[${bbCodeTag}\\]([\\s\\S]*?)\\[\\/${bbCodeTag}\\]`, 'gi'), (_match, content: string) => {
				return `<${htmlTag}>${renderEscapedWorkshopMarkup(content.trim(), imageAltFallback)}</${htmlTag}>`;
			})
		);
	});

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_match, content: string) => {
			return `<pre><code>${content.trim()}</code></pre>`;
		})
	);

	renderedValue = renderedValue.replace(/\[hr\]/gi, '<hr />');
	renderedValue = renderedValue.replace(/\n/g, '<br />');
	renderedValue = renderedValue.replace(/(<br \/>)+(?=<(?:h1|h2|h3|ul|ol|blockquote|pre|hr|img))/g, '');
	renderedValue = renderedValue.replace(/(?<=<\/(?:h1|h2|h3|ul|ol|blockquote|pre|hr|img)>)(<br \/>)+/g, '');

	return renderedValue;
}

export function convertWorkshopDescriptionToHtml(description?: string, options: { imageAltFallback?: string } = {}): string {
	if (!description) {
		return '';
	}

	const normalizedDescription = normalizeLineBreaks(description).trim();
	if (!normalizedDescription) {
		return '';
	}

	const imageAltFallback = options.imageAltFallback?.trim() || DEFAULT_WORKSHOP_DESCRIPTION_IMAGE_ALT;
	return renderEscapedWorkshopMarkup(escapeText(normalizedDescription), imageAltFallback);
}

interface WorkshopDescriptionProps {
	description?: string;
	imageAltFallback?: string;
}

function WorkshopDescriptionComponent({ description, imageAltFallback }: WorkshopDescriptionProps) {
	const renderedDescription = useMemo(
		() => convertWorkshopDescriptionToHtml(description, { imageAltFallback }),
		[description, imageAltFallback]
	);
	if (!renderedDescription) {
		return null;
	}

	return <div className="WorkshopDescription" dangerouslySetInnerHTML={{ __html: renderedDescription }} />;
}

export const WorkshopDescription = memo(WorkshopDescriptionComponent);
