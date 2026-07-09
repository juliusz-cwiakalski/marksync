// The `marksync init` UUID-assignment orchestrator (GH-18 F-6 / PD-2). Owns the
// disk I/O around the pure-domain injectUuid: discover managed docs → read →
// inject if absent → write back. The CLI delegates; it names no domain type.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig, selectFiles } from "#app/config";
import type { DocumentId } from "#domain/identity/document-id";
import { injectUuid } from "#domain/identity/frontmatter";
import type { MarkSyncError } from "#domain/errors";
import { Result } from "#domain/result";

export interface AssignedDoc {
	sourcePath: string;
	uuid: DocumentId;
	written: boolean;
}

const SKIP_DIRS = new Set([".git", "node_modules", ".marksync", "dist"]);

export async function assignUuidsFromDisk(
	cwd: string,
): Promise<Result<AssignedDoc[], MarkSyncError>> {
	const configResult = loadConfig(cwd);
	if (!configResult.ok) return Result.err(configResult.error);

	const managed = selectFiles(configResult.value, await walkMarkdown(cwd, ""));
	const assigned: AssignedDoc[] = [];
	for (const relPath of managed) {
		const absPath = join(cwd, relPath);
		const original = await readFile(absPath, "utf-8");
		const { source, uuid } = injectUuid(original);
		if (source !== original) {
			await writeFile(absPath, source, "utf-8");
			assigned.push({ sourcePath: relPath, uuid, written: true });
		} else {
			assigned.push({ sourcePath: relPath, uuid, written: false });
		}
	}
	return Result.ok(assigned);
}

async function walkMarkdown(root: string, rel: string): Promise<string[]> {
	const entries = await readdir(join(root, rel), { withFileTypes: true });
	const results: string[] = [];
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
		if (entry.isDirectory()) {
			results.push(...(await walkMarkdown(root, childRel)));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(childRel);
		}
	}
	return results;
}
