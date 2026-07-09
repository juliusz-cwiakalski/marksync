// Integration tests for the marksync init UUID-assignment orchestrator
// (GH-18 F-6 / TC-ASSIGN-001..005). Real file I/O via OS temp dirs — no mocks
// (PM-RECON-1 Decision C). Exercises assignUuidsFromDisk + the initCommand
// refused-overwrite path.

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { STARTER_CONFIG, writeStarterConfig } from "#app/config-template";
import { assignUuidsFromDisk } from "#app/identity-assign";
import type { DocumentId } from "#domain/identity/document-id";
import { parseDocumentId } from "#domain/identity/document-id";
import { injectUuid } from "#domain/identity/frontmatter";
import { initCommand } from "#cli/commands/init";

const FIXED_V7 = "0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d";

async function makeCorpus(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "marksync-assign-"));
	await mkdir(join(dir, "docs"), { recursive: true });
	// writeStarterConfig refuses to overwrite — so the corpus starts clean.
	writeStarterConfig(dir);
	await mkdir(join(dir, "docs", "guide"), { recursive: true });
	return dir;
}

describe("assignUuidsFromDisk", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await makeCorpus();
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("TC-ASSIGN-001: injects a uuid into a doc with no front-matter (writes the file)", async () => {
		await writeFile(join(dir, "docs", "a.md"), "# A\nbody\n", "utf-8");
		const result = await assignUuidsFromDisk(dir);
		if (!result.ok) {
			expect.unreachable("expected ok");
			return;
		}
		expect(result.value).toHaveLength(1);
		const doc = result.value[0];
		if (!doc) {
			expect.unreachable("expected one doc");
			return;
		}
		expect(doc.sourcePath).toBe("docs/a.md");
		expect(doc.written).toBe(true);
		expect(parseDocumentId(doc.uuid).ok).toBe(true);

		const onDisk = await readFile(join(dir, "docs", "a.md"), "utf-8");
		expect(onDisk).toContain(`uuid: ${doc.uuid}`);
	});

	test("TC-ASSIGN-002: idempotent skip — a doc that already has a uuid is NOT rewritten", async () => {
		const content = `---\nmarksync:\n  uuid: ${FIXED_V7}\n---\nbody\n`;
		await writeFile(join(dir, "docs", "a.md"), content, "utf-8");
		const result = await assignUuidsFromDisk(dir);
		if (!result.ok) {
			expect.unreachable("expected ok");
			return;
		}
		const doc = result.value[0];
		if (!doc) {
			expect.unreachable("expected one doc");
			return;
		}
		expect(doc.written).toBe(false);
		expect(doc.uuid).toBe(FIXED_V7);
		const onDisk = await readFile(join(dir, "docs", "a.md"), "utf-8");
		expect(Buffer.from(onDisk).equals(Buffer.from(content))).toBe(true);
	});

	test("TC-ASSIGN-003: mixed corpus — only without-uuid docs are written, each once", async () => {
		await writeFile(join(dir, "docs", "no1.md"), "# no1\n", "utf-8");
		await writeFile(join(dir, "docs", "guide", "no2.md"), "# no2\n", "utf-8");
		await writeFile(
			join(dir, "docs", "yes.md"),
			`---\nmarksync:\n  uuid: ${FIXED_V7}\n---\ny\n`,
			"utf-8",
		);
		const result = await assignUuidsFromDisk(dir);
		if (!result.ok) {
			expect.unreachable("expected ok");
			return;
		}
		expect(result.value).toHaveLength(3);
		const written = result.value
			.filter((d) => d.written)
			.map((d) => d.sourcePath)
			.sort();
		const skipped = result.value
			.filter((d) => !d.written)
			.map((d) => d.sourcePath);
		expect(written).toEqual(["docs/guide/no2.md", "docs/no1.md"]);
		expect(skipped).toEqual(["docs/yes.md"]);
	});

	test("TC-ASSIGN-004: byte-stability through the orchestrator (writes injectUuid's bytes verbatim)", async () => {
		const input =
			"---\ntitle: Rich\nmarksync:\n  title: Override\n---\n# Body\n\npara\n";
		await writeFile(join(dir, "docs", "rich.md"), input, "utf-8");
		const result = await assignUuidsFromDisk(dir);
		if (!result.ok) {
			expect.unreachable("expected ok");
			return;
		}
		const doc = result.value[0];
		if (!doc) {
			expect.unreachable("expected one doc");
			return;
		}
		// The orchestrator must write EXACTLY what injectUuid would produce for
		// the same generated uuid — verbatim, no reformatting through the write.
		const expected = injectUuid(input, (): DocumentId => doc.uuid).source;
		const onDisk = await readFile(join(dir, "docs", "rich.md"), "utf-8");
		expect(Buffer.from(onDisk).equals(Buffer.from(expected))).toBe(true);
	});

	test("TC-ASSIGN-005: refused-overwrite init does NOT assign UUIDs (OQ-TP-1)", async () => {
		// marksync.yml already exists (makeCorpus wrote it) → writeStarterConfig
		// refuses → initCommand early-returns BEFORE assignUuidsFromDisk runs.
		await writeFile(join(dir, "docs", "a.md"), "# A\n", "utf-8");
		const before = await readFile(join(dir, "docs", "a.md"), "utf-8");

		const result = await initCommand({ cwd: dir });
		expect(result.exitCode).toBe(10);
		expect(result.error?.code).toBe("INVALID_CONFIG");

		const after = await readFile(join(dir, "docs", "a.md"), "utf-8");
		expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true);
	});
});
