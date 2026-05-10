import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { applyRendererContentSecurityPolicy, createRendererContentSecurityPolicy } from '../../shared/renderer-csp';

function getDirective(policy: string, directiveName: string) {
	return policy
		.split(';')
		.map((directive) => directive.trim())
		.find((directive) => directive.startsWith(`${directiveName} `));
}

describe('renderer CSP', () => {
	it('builds a production policy without inline scripts while preserving required app resources', () => {
		const policy = createRendererContentSecurityPolicy({ isDevelopment: false });

		expect(getDirective(policy, 'script-src')).toBe("script-src 'self'");
		expect(policy).not.toContain("'unsafe-inline' data: blob:");
		expect(getDirective(policy, 'img-src')).toBe("img-src 'self' data: blob: image: https:");
		expect(getDirective(policy, 'connect-src')).toBe("connect-src 'self' https:");
		expect(getDirective(policy, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
		expect(getDirective(policy, 'object-src')).toBe("object-src 'none'");
	});

	it('keeps development permissions for Vite and local assets', () => {
		const policy = createRendererContentSecurityPolicy({ isDevelopment: true });

		expect(getDirective(policy, 'script-src')).toBe("script-src 'self' 'unsafe-inline'");
		expect(getDirective(policy, 'connect-src')).toBe("connect-src 'self' ws://localhost:* http://localhost:* https:");
		expect(getDirective(policy, 'img-src')).toBe("img-src 'self' data: blob: image: http://localhost:* https:");
	});

	it('injects the production policy into renderer HTML', () => {
		const rendererHtml = fs.readFileSync(path.resolve(__dirname, '../../renderer/index.html'), 'utf8');
		const html = applyRendererContentSecurityPolicy(rendererHtml, { isDevelopment: false });

		expect(html).toContain('Content-Security-Policy');
		expect(html).toContain("script-src 'self'; object-src 'none'");
		expect(html).not.toContain("script-src 'self' 'unsafe-inline'");
	});
});
