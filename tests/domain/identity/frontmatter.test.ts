// Unit tests for byte-stable front-matter read/inject (GH-18 F-3 /
// TC-FM-001..009 / TC-INJECT-001..008). Byte-stability is an INLINE exact-string
// assertion here — no separate golden/integration fixture (ADR-0006 C-1).

import { describe, expect, test } from "bun:test";
import { injectUuid, readUuid } from "#domain/identity/frontmatter";
import type { DocumentId } from "#domain/identity/document-id";
import { isUuidV7 } from "#domain/identity/uuid";

const FIXED_V7 = "0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
const fixedGen = (): DocumentId => FIXED_V7 as DocumentId;
const realV4 = "550e8400-e29b-41d4-a716-446655440000";

const bytesEqual = (a: string, b: string): boolean =>
	Buffer.from(a).equals(Buffer.from(b));

describe("readUuid", () => {
	test("TC-FM-001: returns DocumentId when present; undefined otherwise", () => {
		const withUuid = `---\nmarksync:\n  uuid: ${FIXED_V7}\n---\nbody\n`;
		expect(readUuid(withUuid)).toBe(FIXED_V7);

		expect(readUuid("# no front-matter\nbody")).toBeUndefined();
		expect(readUuid("---\ntitle: Foo\n---\nbody")).toBeUndefined();
	});

	test("TC-FM-002: tolerant of malformed value / fences — never throws", () => {
		expect(
			readUuid(`---\nmarksync:\n  uuid: ${realV4}\n---\nbody`),
		).toBeUndefined();
		expect(
			readUuid("---\nmarksync:\n  uuid: not-a-uuid\n---\nbody"),
		).toBeUndefined();
		expect(readUuid("---\nmarksync:\n  uuid: 123\n---\nbody")).toBeUndefined();
		// missing closing fence
		expect(readUuid("---\nmarksync:\n  uuid: x\nbody")).toBeUndefined();
		// front-matter value not a mapping
		expect(readUuid("---\nmarksync: just-a-string\n---\nbody")).toBeUndefined();
		// empty doc
		expect(readUuid("")).toBeUndefined();
	});
});

describe("injectUuid", () => {
	test("TC-FM-003: injects a fresh block when there is no front-matter; body preserved", () => {
		const input = "# Title\n\nparagraph\n";
		const { source, uuid } = injectUuid(input, fixedGen);
		expect(isUuidV7(uuid)).toBe(true);
		expect(uuid).toBe(FIXED_V7);
		expect(source).toBe(
			`---\nmarksync:\n  uuid: ${FIXED_V7}\n---\n# Title\n\nparagraph\n`,
		);
		// body byte-identical
		expect(source.endsWith("# Title\n\nparagraph\n")).toBe(true);
	});

	test("TC-FM-004: idempotent — a present uuid is never overwritten; second pass is a no-op", () => {
		const input = `---\nmarksync:\n  uuid: ${FIXED_V7}\n---\nbody\n`;
		const { source, uuid } = injectUuid(input, fixedGen);
		expect(uuid).toBe(FIXED_V7);
		expect(bytesEqual(source, input)).toBe(true);

		const second = injectUuid(source, fixedGen);
		expect(second.uuid).toBe(FIXED_V7);
		expect(bytesEqual(second.source, source)).toBe(true);
	});

	test("TC-FM-005: injects under an existing marksync map without disturbing siblings", () => {
		const input = "---\nmarksync:\n  title: Foo\n---\nbody\n";
		const { source, uuid } = injectUuid(input, fixedGen);
		expect(uuid).toBe(FIXED_V7);
		expect(source).toBe(
			`---\nmarksync:\n  uuid: ${FIXED_V7}\n  title: Foo\n---\nbody\n`,
		);
	});

	test("TC-FM-006: CRLF line endings are preserved (no LF normalization)", () => {
		const input = "---\r\ntitle: Foo\r\n---\r\nbody line\r\n";
		const { source } = injectUuid(input, fixedGen);
		// every \n in the output is preceded by \r (pure CRLF, no lone LF)
		expect(source.match(/[^\r]\n/g)).toBeNull();
		expect(source.endsWith("body line\r\n")).toBe(true);
		expect(source).toBe(
			`---\r\ntitle: Foo\r\nmarksync:\r\n  uuid: ${FIXED_V7}\r\n---\r\nbody line\r\n`,
		);
	});

	test("TC-FM-007: byte-stability — output is input + ONLY the uuid line (exact-string)", () => {
		const input = [
			"---",
			"title: My Doc",
			"tags: [a, b]",
			"# a comment line",
			"marksync:",
			"  title: Override",
			"---",
			"# Heading",
			"",
			"Paragraph with **bold**.",
			"",
			"```",
			"code block",
			"```",
			"",
		].join("\n");

		const { source, uuid } = injectUuid(input, fixedGen);
		expect(uuid).toBe(FIXED_V7);

		const expected = [
			"---",
			"title: My Doc",
			"tags: [a, b]",
			"# a comment line",
			"marksync:",
			`  uuid: ${FIXED_V7}`,
			"  title: Override",
			"---",
			"# Heading",
			"",
			"Paragraph with **bold**.",
			"",
			"```",
			"code block",
			"```",
			"",
		].join("\n");

		// exact byte equality (Buffer compare, not a normalized string compare)
		expect(bytesEqual(source, expected)).toBe(true);

		// stripping the single injected uuid line recovers the input bytes exactly
		const stripped = source.replace(`  uuid: ${FIXED_V7}\n`, "");
		expect(bytesEqual(stripped, input)).toBe(true);

		// second inject is byte-identical (idempotency)
		const second = injectUuid(source, fixedGen);
		expect(bytesEqual(second.source, source)).toBe(true);
		expect(second.uuid).toBe(FIXED_V7);
	});

	test("TC-FM-008: re-clone recovery — readUuid on the injected output returns the same uuid", () => {
		const input = "---\ntitle: Foo\n---\nbody\n";
		const { source, uuid } = injectUuid(input, fixedGen);
		expect(readUuid(source)).toBe(uuid);
	});

	test("TC-FM-009: path-independence — readUuid depends only on front-matter content", () => {
		// Same content under two different conceptual paths reads identically.
		const block = `---\nmarksync:\n  uuid: ${FIXED_V7}\n---\nbody\n`;
		const fromDocs = block;
		const fromRenamed = block;
		expect(readUuid(fromDocs)).toBe(readUuid(fromRenamed));
		expect(readUuid(fromDocs)).toBe(FIXED_V7);
	});

	test("TC-INJECT-008: inject then readUuid round-trips the same uuid in-memory", () => {
		const input = "# body only\n";
		const { source, uuid } = injectUuid(input, fixedGen);
		expect(readUuid(source)).toBe(uuid);
	});

	test("default generator produces a real v7 (not the fixed one)", () => {
		const { uuid } = injectUuid("# body\n");
		expect(isUuidV7(uuid)).toBe(true);
		expect(uuid).not.toBe(FIXED_V7);
	});
});
