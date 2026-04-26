const RENDERER_CSP_PLACEHOLDER = '%TTSMM_RENDERER_CSP%';

interface RendererCspOptions {
	isDevelopment: boolean;
}

const DEVELOPMENT_RENDERER_CSP_DIRECTIVES = [
	['default-src', "'self'", "'unsafe-inline'", 'data:', 'blob:'],
	['img-src', "'self'", 'data:', 'blob:', 'image:', 'http://localhost:*', 'https:'],
	['connect-src', "'self'", 'ws://localhost:*', 'http://localhost:*', 'https:'],
	['style-src', "'self'", "'unsafe-inline'"],
	['script-src', "'self'", "'unsafe-inline'"]
] as const;

const PRODUCTION_RENDERER_CSP_DIRECTIVES = [
	['default-src', "'self'"],
	['img-src', "'self'", 'data:', 'blob:', 'image:', 'https:'],
	['connect-src', "'self'", 'https:'],
	['style-src', "'self'", 'file:', "'unsafe-inline'"],
	['script-src', "'self'", 'file:'],
	['object-src', "'none'"],
	['base-uri', "'self'"]
] as const;

function serializeCspDirectives(directives: readonly (readonly string[])[]) {
	return directives.map((directive) => `${directive[0]} ${directive.slice(1).join(' ')}`).join('; ');
}

export function createRendererContentSecurityPolicy({ isDevelopment }: RendererCspOptions) {
	return serializeCspDirectives(isDevelopment ? DEVELOPMENT_RENDERER_CSP_DIRECTIVES : PRODUCTION_RENDERER_CSP_DIRECTIVES);
}

export function applyRendererContentSecurityPolicy(html: string, options: RendererCspOptions) {
	if (!html.includes(RENDERER_CSP_PLACEHOLDER)) {
		throw new Error(`Renderer HTML is missing ${RENDERER_CSP_PLACEHOLDER}`);
	}

	return html.replace(RENDERER_CSP_PLACEHOLDER, createRendererContentSecurityPolicy(options));
}
