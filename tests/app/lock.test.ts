// tests/app/lock.test.ts
//
// Unit tests for loadLock (GH-19 F-1/F-2, TC-LOCK-001..005). Exercises the REAL
// yaml parser + ajv validator (no mock — over-mocking guardrail). Covers:
//   - TC-LOCK-001 valid lock -> ok(LockFile) with uuid injected from its key;
//   - TC-LOCK-002 missing file -> ok(empty) (DEC-5);
//   - TC-LOCK-003 bad version -> err(CorruptLock) with an AI-readable message;
//   - TC-LOCK-004 missing required field -> err(CorruptLock) with a JSON pointer;
//   - TC-LOCK-005 unparseable YAML -> err(CorruptLock);
//   - TC-CORRUPT-001 (producer): a real CorruptLock flows through the mapper to
//     the stable CORRUPT_LOCK code + non-zero exit (first producer of the arm).

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { mapMarkSyncErrorToCommandError } from "#app/cli-error-map";
import { loadLock } from "#app/lock";
import { codeToExitCode } from "#cli/output/exit-codes";
import type { LockError } from "#domain/errors";
import type { Result } from "#domain/result";

const UUID_A = "0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d";

/** A complete, valid document entry (PageBinding minus uuid — uuid is the key). */
const VALID_ENTRY = `sourcePath: docs/arch.md
pageId: "1122334455"
parentPageId: "987654321"
pageVersion: 7
sourceCommit: "abc123fullsha0000000000000000000000000000"
sourceContentHash: "sha256:source-aaa"
renderedBodyHash: "sha256:rendered-bbb"
remoteBodyHash: "sha256:remote-ccc"
attachmentHashes:
  assets/diagram.png: "sha256:png-1"
operationId: "op-0192b3d4"
synchronizedAt: "2026-07-09T00:00:00Z"
toolVersion: "0.4.0"`;

function loadYaml(yaml: string): Result<unknown, LockError> {
	const dir = mkdtempSync(join(tmpdir(), "ms-lock-"));
	try {
		writeFileSync(join(dir, "marksync.lock.yml"), yaml);
		return loadLock(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function expectCorruptLock(
	r: Result<unknown, LockError>,
): Extract<LockError, { kind: "CorruptLock" }> {
	expect(r.ok).toBe(false);
	if (r.ok) throw new Error("expected error, got ok");
	expect(r.error.kind).toBe("CorruptLock");
	if (r.error.kind !== "CorruptLock") throw new Error("expected CorruptLock");
	return r.error;
}

describe("loadLock — valid (AC-F1-1 / NFR-2)", () => {
	test("TC-LOCK-001: valid lock -> ok(LockFile) with uuid injected from its key", () => {
		const yaml = `version: 1\ntargets:\n  corporate:\n    documents:\n      ${UUID_A}:\n${VALID_ENTRY.replace(/^/gm, "        ")}\n`;
		const r = loadYaml(yaml);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const lock = r.value;
		expect(lock.version).toBe(1);
		expect(Object.keys(lock.targets)).toEqual(["corporate"]);
		const docs = lock.targets.corporate.documents;
		const binding = docs[UUID_A];
		expect(binding).toBeDefined();
		if (!binding) return;
		// uuid injected from the key, not parsed as a field.
		expect(binding.uuid).toBe(UUID_A);
		expect(binding.sourcePath).toBe("docs/arch.md");
		expect(binding.pageId).toBe("1122334455");
		expect(binding.parentPageId).toBe("987654321");
		expect(binding.pageVersion).toBe(7);
		expect(binding.sourceCommit).toBe(
			"abc123fullsha0000000000000000000000000000",
		);
		expect(binding.sourceContentHash).toBe("sha256:source-aaa");
		expect(binding.attachmentHashes).toEqual({
			"assets/diagram.png": "sha256:png-1",
		});
		expect(binding.operationId).toBe("op-0192b3d4");
		expect(binding.toolVersion).toBe("0.4.0");
	});
});

describe("loadLock — missing file is the initial state (DEC-5 / NFR-12)", () => {
	test("TC-LOCK-002: absent marksync.lock.yml -> ok(empty LockFile)", () => {
		const dir = mkdtempSync(join(tmpdir(), "ms-lock-"));
		try {
			expect(existsSync(join(dir, "marksync.lock.yml"))).toBe(false);
			const r = loadLock(dir);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			expect(r.value).toEqual({ version: 1, targets: {} });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("loadLock — invalid (AC-F1-1 / NFR-3, DEC-2)", () => {
	test("TC-LOCK-003: version !== 1 -> err(CorruptLock) referencing the version field", () => {
		const yaml = `version: 2\ntargets: {}\n`;
		const err = expectCorruptLock(loadYaml(yaml));
		expect(err.path).toContain("marksync.lock.yml");
		// ajv const error on /version is carried structurally.
		expect(err.ajvErrors?.some((e) => e.keyword === "const")).toBe(true);
		expect(err.ajvErrors?.some((e) => e.instancePath === "/version")).toBe(
			true,
		);
		// humanMessage is AI-readable: names version + expected + a suggested fix.
		expect(err.humanMessage).toMatch(/version/);
		expect(err.humanMessage).toMatch(/suggested fix/i);
	});

	test("TC-LOCK-004: missing required field -> err(CorruptLock) naming the field + JSON pointer", () => {
		// Drop pageId from the entry.
		const entryNoPageId = VALID_ENTRY.replace(/pageId:.*\n/, "");
		const yaml = `version: 1\ntargets:\n  corporate:\n    documents:\n      ${UUID_A}:\n${entryNoPageId.replace(/^/gm, "        ")}\n`;
		const err = expectCorruptLock(loadYaml(yaml));
		const required = err.ajvErrors?.find((e) => e.keyword === "required");
		expect(required).toBeDefined();
		expect(required?.instancePath).toContain(UUID_A);
		expect(err.humanMessage).toMatch(/missing required field/i);
		expect(err.humanMessage).toMatch(/pageId/);
	});

	test("TC-LOCK-005: unparseable YAML -> err(CorruptLock) conveying the parse failure", () => {
		// Unbalanced flow quote — yaml throws a syntax error.
		const yaml = `version: 1\ntargets: { corporate: { documents: { "broken\n`;
		const err = expectCorruptLock(loadYaml(yaml));
		// Parse failure: no structured ajv errors, but an AI-readable message.
		expect(err.ajvErrors).toBeUndefined();
		expect(err.humanMessage).toMatch(/invalid YAML/i);
		expect(err.humanMessage).toMatch(/suggested fix/i);
	});
});

describe("loadLock — TC-CORRUPT-001 producer (GH-19 DEC-2)", () => {
	test("a CorruptLock produced by loadLock flows through the mapper to CORRUPT_LOCK + non-zero exit", () => {
		// Produce a real CorruptLock (the bad-version case from TC-LOCK-003).
		const r = loadYaml(`version: 2\ntargets: {}\n`);
		const err = expectCorruptLock(r);
		// First producer of the Phase-0 arm: it maps to the stable code + exit.
		const mapped = mapMarkSyncErrorToCommandError(err);
		expect(mapped.code).toBe("CORRUPT_LOCK");
		expect(mapped.retryable).toBe(false);
		expect(codeToExitCode(mapped.code)).toBe(10);
		expect(codeToExitCode(mapped.code)).not.toBe(0);
	});
});
