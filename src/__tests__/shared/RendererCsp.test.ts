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

function getDirectiveSources(policy: string, directiveName: string) {
	return getDirective(policy, directiveName)?.split(/\s+/).slice(1) ?? [];
}

function expectDirectiveSources(policy: string, directiveName: string, sources: string[]) {
	expect(getDirectiveSources(policy, directiveName).sort()).toEqual([...sources].sort());
}

describe('renderer CSP', () => {
	it('builds a production policy without inline scripts while preserving required app resources', () => {
		const policy = createRendererContentSecurityPolicy({ isDevelopment: false });

		expectDirectiveSources(policy, 'script-src', ["'self'", 'file:']);
		expect(policy).not.toContain("'unsafe-inline' data: blob:");
		expectDirectiveSources(policy, 'img-src', ["'self'", 'data:', 'blob:', 'image:', 'https:']);
		expectDirectiveSources(policy, 'connect-src', ["'self'", 'https:']);
		expectDirectiveSources(policy, 'style-src', ["'self'", 'file:', "'unsafe-inline'"]);
		expectDirectiveSources(policy, 'object-src', ["'none'"]);
	});

	it('keeps development permissions for Vite and local assets', () => {
		const policy = createRendererContentSecurityPolicy({ isDevelopment: true });

		expect(getDirectiveSources(policy, 'script-src')).toEqual(expect.arrayContaining(["'self'", "'unsafe-inline'", "'unsafe-eval'"]));
		expect(getDirectiveSources(policy, 'connect-src')).toEqual(expect.arrayContaining(["'self'", 'ws://localhost:*', 'http://localhost:*', 'https:']));
		expect(getDirectiveSources(policy, 'img-src')).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:', 'image:', 'http://localhost:*', 'https:']));
	});

	it('injects the production policy into renderer HTML', () => {
		const rendererHtml = fs.readFileSync(path.resolve(__dirname, '../../renderer/index.html'), 'utf8');
		const html = applyRendererContentSecurityPolicy(rendererHtml, { isDevelopment: false });

		expect(html).toContain('Content-Security-Policy');
		expect(html).toContain("script-src 'self' file:");
		expect(html).toContain("object-src 'none'");
		expect(html).not.toContain("script-src 'self' 'unsafe-inline'");
	});
});
