// Front-matter identity binding — byte-stable read/inject of `marksync.uuid`
// (ADR-0006 C-1). injectUuid is a PURE string transform: surgical text
// insertion, never a yaml.stringify round-trip (byte-stability — no whitespace
// normalization, key reorder, or body mutation).

import { parse as parseYaml } from "yaml";
import { parseDocumentId, type DocumentId } from "#domain/identity/document-id";
import { generateUuidV7 } from "#domain/identity/uuid";

interface FrontMatter {
	contentStart: number;
	closeStart: number;
}

export function readUuid(source: string): DocumentId | undefined {
	const fm = findFrontMatter(source);
	if (fm === null) return undefined;
	let parsed: unknown;
	try {
		parsed = parseYaml(source.slice(fm.contentStart, fm.closeStart));
	} catch {
		return undefined;
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return undefined;
	}
	const ms = (parsed as Record<string, unknown>).marksync;
	if (ms === null || typeof ms !== "object" || Array.isArray(ms)) {
		return undefined;
	}
	const raw = (ms as Record<string, unknown>).uuid;
	if (typeof raw !== "string") return undefined;
	const result = parseDocumentId(raw);
	return result.ok ? result.value : undefined;
}

export function injectUuid(
	source: string,
	generate: () => DocumentId = generateUuidV7,
): { source: string; uuid: DocumentId } {
	const existing = readUuid(source);
	if (existing !== undefined) {
		return { source, uuid: existing };
	}
	const uuid = generate();
	const eol = detectEol(source);
	const fm = findFrontMatter(source);
	if (fm === null) {
		const block = `---${eol}marksync:${eol}  uuid: ${uuid}${eol}---${eol}`;
		return { source: block + source, uuid };
	}
	const content = source.slice(fm.contentStart, fm.closeStart);
	const { offset, line } = findMarksyncInsertion(content, eol, uuid);
	const nextContent = content.slice(0, offset) + line + content.slice(offset);
	return {
		source:
			source.slice(0, fm.contentStart) +
			nextContent +
			source.slice(fm.closeStart),
		uuid,
	};
}

/**
 * Locate where to splice the `uuid` child + the exact line (with EOL) to insert.
 * Either under an existing block-style `marksync:` map header, or — when none
 * exists — as a fresh `marksync:` map appended at the end of the block.
 */
function findMarksyncInsertion(
	content: string,
	eol: string,
	uuid: DocumentId,
): { offset: number; line: string } {
	const header = /^marksync:[ \t]*(?=\r?\n|$)/m.exec(content);
	if (header !== null && header.index !== undefined) {
		const childStart = consumeEol(content, header.index + header[0].length);
		return {
			offset: childStart,
			line: `${childIndent(content, childStart)}uuid: ${uuid}${eol}`,
		};
	}
	return {
		offset: content.length,
		line: `marksync:${eol}  uuid: ${uuid}${eol}`,
	};
}

function childIndent(content: string, lineStart: number): string {
	const m = /^([ \t]+)\S/.exec(content.slice(lineStart));
	return m !== null ? (m[1] ?? "  ") : "  ";
}

function findFrontMatter(source: string): FrontMatter | null {
	if (!source.startsWith("---")) return null;
	const openerEol = matchEolAt(source, 3);
	if (openerEol === null) return null;
	const contentStart = 3 + openerEol.length;
	let pos = contentStart;
	while (pos < source.length) {
		const lineEnd = indexOfNewline(source, pos);
		const trimmed = source.slice(pos, lineEnd).trim();
		if (trimmed === "---" || trimmed === "...") {
			return { contentStart, closeStart: pos };
		}
		pos = lineEnd < source.length ? lineEnd + 1 : source.length;
	}
	return null;
}

function matchEolAt(s: string, i: number): string | null {
	if (s[i] === "\n") return "\n";
	if (s[i] === "\r" && s[i + 1] === "\n") return "\r\n";
	return null;
}

function consumeEol(s: string, i: number): number {
	if (s[i] === "\n") return i + 1;
	if (s[i] === "\r" && s[i + 1] === "\n") return i + 2;
	return i;
}

function indexOfNewline(s: string, from: number): number {
	const i = s.indexOf("\n", from);
	return i === -1 ? s.length : i;
}

function detectEol(source: string): string {
	const i = source.indexOf("\n");
	return i > 0 && source[i - 1] === "\r" ? "\r\n" : "\n";
}
