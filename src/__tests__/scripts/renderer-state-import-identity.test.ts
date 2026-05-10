// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const rendererRoot = path.join(process.cwd(), 'src', 'renderer');
const rendererStateRoot = path.join(rendererRoot, 'state');
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'];
const sourceExtensionSet = new Set(sourceExtensions);

function walkSourceFiles(directoryPath: string): string[] {
	const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const entryPath = path.join(directoryPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkSourceFiles(entryPath));
			continue;
		}

		if (entry.isFile() && sourceExtensionSet.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
			files.push(entryPath);
		}
	}

	return files;
}

function resolveRelativeImport(importerPath: string, specifier: string): string | undefined {
	const candidatePath = path.resolve(path.dirname(importerPath), specifier);
	const candidates = [
		candidatePath,
		...sourceExtensions.map((extension) => `${candidatePath}${extension}`),
		...sourceExtensions.map((extension) => path.join(candidatePath, `index${extension}`))
	];

	return candidates.find((candidate) => fs.existsSync(candidate));
}

function getStringLiteralSpecifier(node: ts.Node): string | undefined {
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
		const specifier = node.moduleSpecifier;
		return specifier && ts.isStringLiteral(specifier) ? specifier.text : undefined;
	}

	if (
		ts.isCallExpression(node) &&
		node.expression.kind === ts.SyntaxKind.ImportKeyword &&
		node.arguments.length === 1 &&
		ts.isStringLiteral(node.arguments[0])
	) {
		return node.arguments[0].text;
	}

	return undefined;
}

function collectRelativeRendererStateImports() {
	const violations: string[] = [];

	for (const filePath of walkSourceFiles(rendererRoot)) {
		const sourceText = fs.readFileSync(filePath, 'utf8');
		const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

		const visit = (node: ts.Node) => {
			const specifier = getStringLiteralSpecifier(node);
			if (specifier?.startsWith('.')) {
				const resolvedImport = resolveRelativeImport(filePath, specifier);
				if (resolvedImport && path.relative(rendererStateRoot, resolvedImport).split(path.sep)[0] !== '..') {
					const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
					const relativeFilePath = path.relative(process.cwd(), filePath);
					violations.push(`${relativeFilePath}:${line + 1}:${character + 1} imports ${specifier}`);
				}
			}

			ts.forEachChild(node, visit);
		};

		visit(sourceFile);
	}

	return violations;
}

describe('renderer state import identity', () => {
	it('keeps renderer state imports on the canonical renderer/state alias', () => {
		expect(collectRelativeRendererStateImports()).toEqual([]);
	});
});
