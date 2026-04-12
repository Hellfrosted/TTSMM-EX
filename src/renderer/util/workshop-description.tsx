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

function renderEscapedWorkshopMarkup(value: string): string {
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
				return `<${tagName}><li>${renderEscapedWorkshopMarkup(content.trim())}</li></${tagName}>`;
			}

			const items = rawItems.map((item) => `<li>${renderEscapedWorkshopMarkup(item)}</li>`).join('');
			return `<${tagName}>${items}</${tagName}>`;
		})
	);

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_match, content: string) => {
			const imageSource = sanitizeUrl(content);
			if (!imageSource) {
				return renderEscapedWorkshopMarkup(content.trim());
			}

			return `<img src="${imageSource}" alt="" loading="lazy" />`;
		})
	);

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_match, href: string, content: string) => {
			const sanitizedUrl = sanitizeUrl(href);
			const linkBody = renderEscapedWorkshopMarkup(content.trim());
			if (!sanitizedUrl) {
				return linkBody;
			}

			return `<a href="${sanitizedUrl}" target="_blank" rel="noreferrer noopener">${linkBody}</a>`;
		})
	);

	renderedValue = replaceLoop(renderedValue, (currentValue) =>
		currentValue.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_match, content: string) => {
			const sanitizedUrl = sanitizeUrl(content);
			const linkBody = renderEscapedWorkshopMarkup(content.trim());
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
				return `<${htmlTag}>${renderEscapedWorkshopMarkup(content.trim())}</${htmlTag}>`;
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

export function convertWorkshopDescriptionToHtml(description?: string): string {
	if (!description) {
		return '';
	}

	const normalizedDescription = normalizeLineBreaks(description).trim();
	if (!normalizedDescription) {
		return '';
	}

	return renderEscapedWorkshopMarkup(escapeText(normalizedDescription));
}

interface WorkshopDescriptionProps {
	description?: string;
}

function WorkshopDescriptionComponent({ description }: WorkshopDescriptionProps) {
	const renderedDescription = useMemo(() => convertWorkshopDescriptionToHtml(description), [description]);
	if (!renderedDescription) {
		return null;
	}

	return <div className="WorkshopDescription" dangerouslySetInnerHTML={{ __html: renderedDescription }} />;
}

export const WorkshopDescription = memo(WorkshopDescriptionComponent);
