import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openJournal, replayJournal } from "#app/journal";

describe("journal writer + replay", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "gh23-journal-"));
	});

	afterEach(() => {
		rmSync(tmp, { recursive: true, force: true });
	});

	test("append + read - single entry", () => {
		const journal = openJournal(tmp, "run-1");
		journal.append({
			op: "create",
			pageId: "123",
			uuid: "uuid-1",
			outcome: "success",
		});

		const replayResult = replayJournal(tmp, "run-1");
		expect(replayResult).toHaveLength(1);
		const entry = replayResult[0]!;
		expect(entry.op).toBe("create");
		expect(entry.pageId).toBe("123");
		expect(entry.uuid).toBe("uuid-1");
		expect(entry.outcome).toBe("success");
		expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});

	test("append + read - multiple entries", () => {
		const journal = openJournal(tmp, "run-1");

		journal.append({
			op: "create",
			pageId: "123",
			uuid: "uuid-1",
			outcome: "success",
		});

		journal.append({
			op: "update",
			pageId: "456",
			uuid: "uuid-2",
			outcome: "failed",
		});

		const replayResult = replayJournal(tmp, "run-1");
		expect(replayResult).toHaveLength(2);
		expect(replayResult[0]!.op).toBe("create");
		expect(replayResult[1]!.op).toBe("update");
	});

	test("replay - missing file returns []", () => {
		const replayResult = replayJournal(tmp, "never-run");
		expect(replayResult).toHaveLength(0);
	});

	test("crash tolerance - skips malformed trailing line", () => {
		const journal = openJournal(tmp, "run-1");

		journal.append({
			op: "create",
			pageId: "123",
			uuid: "uuid-1",
			outcome: "success",
		});

		// Manually append a malformed line to simulate a crash
		const { appendFileSync } = require("node:fs");
		appendFileSync(
			join(tmp, "journal", "run-1.jsonl"),
			'{"op":"update","pageId":"456","uuid":"uuid-2","outcome":"success"',
			"utf-8",
		);

		const replayResult = replayJournal(tmp, "run-1");
		expect(replayResult).toHaveLength(1); // Only the valid entry
		expect(replayResult[0]!.op).toBe("create");
	});

	test("unwritable path - throws on append", () => {
		// Create a non-writable directory by making the journal dir read-only
		const { chmodSync, mkdirSync } = require("node:fs");
		const unwritableDir = join(tmp, "journal");
		mkdirSync(unwritableDir);
		chmodSync(unwritableDir, 0o444); // read-only directory

		const journal = openJournal(tmp, "run-2");
		expect(() =>
			journal.append({
				op: "create",
				pageId: "123",
				uuid: "uuid-1",
				outcome: "success",
			}),
		).toThrow();
	});

	test("secrets guardrail - entry contains only allowed fields", () => {
		const journal = openJournal(tmp, "run-1");
		const fakeToken = "super-secret-token-12345";

		journal.append({
			op: "create",
			pageId: "123",
			uuid: "uuid-1",
			outcome: "success",
		});

		const replayResult = replayJournal(tmp, "run-1");
		const fileContent = replayResult
			.map((e) => JSON.stringify(e))
			.join("\n");
		expect(fileContent).not.toContain(fakeToken);
	});

	test("secrets guardrail - no token leakage even in error case", () => {
		const journal = openJournal(tmp, "run-1");

		journal.append({
			op: "create",
			pageId: "123",
			uuid: "uuid-1",
			outcome: "success",
		});

		const replayResult = replayJournal(tmp, "run-1");
		const entry = replayResult[0]!;
		const keys = Object.keys(entry);
		expect(keys).toContain("ts");
		expect(keys).toContain("op");
		expect(keys).toContain("pageId");
		expect(keys).toContain("uuid");
		expect(keys).toContain("outcome");
	});
});