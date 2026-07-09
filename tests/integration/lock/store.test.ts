// tests/integration/lock/store.test.ts
//
// Integration tests for the atomic lock store (GH-19 F-3, TC-ATOMIC-001/002).
// Real temp-dir I/O via the OS temp root — no mocks (over-mocking guardrail);
// the only fault injection is the documented crash hook.
//   - TC-ATOMIC-001: crash between temp-write and rename -> dest UNCHANGED, temp
//     abandoned (no partial lock on disk).
//   - TC-ATOMIC-002: replace-over-existing via fs.rename (POSIX + Windows/Bun).

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { armCrashAfterTempWrite, writeAtomic } from "#infra/lock/store";

const TMP_SUFFIX = ".marksync-tmp";

describe("writeAtomic — TC-ATOMIC-001: crash leaves dest unchanged, temp abandoned", () => {
	let dir: string;

	afterEach(() => {
		// Always disarm so an armed crash can't leak into another test.
		armCrashAfterTempWrite(false);
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	test("an injected crash between temp-write and rename preserves the destination", () => {
		dir = mkdtempSync(join(tmpdir(), "ms-atomic-"));
		const dest = join(dir, "marksync.lock.yml");
		const orig = "ORIG_LOCK_BYTES\n";
		writeFileSync(dest, orig, "utf-8");

		armCrashAfterTempWrite(true);

		// The crash is a simulated process death: it throws (does not return err).
		expect(() => writeAtomic(dest, "NEW_LOCK_BYTES\n")).toThrow(
			/__marksync_test_crash_after_temp_write/,
		);

		// The destination is byte-identical to the pre-existing content — the
		// partial write never reached it (AC-F3-1 / NFR-4).
		const after = readFileSync(dest, "utf-8");
		expect(Buffer.from(after).equals(Buffer.from(orig))).toBe(true);

		// The temp file exists (abandoned) but is NOT the lock.
		const tmp = `${dest}${TMP_SUFFIX}`;
		expect(existsSync(tmp)).toBe(true);
		expect(readFileSync(tmp, "utf-8")).toBe("NEW_LOCK_BYTES\n");
	});
});

describe("writeAtomic — TC-ATOMIC-002: replace-over-existing (NFR-5)", () => {
	let dir: string;

	afterEach(() => {
		armCrashAfterTempWrite(false);
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	test("fs.rename replace-over-existing yields the new content at dest", () => {
		dir = mkdtempSync(join(tmpdir(), "ms-atomic-"));
		const dest = join(dir, "marksync.lock.yml");
		writeFileSync(dest, "OLD\n", "utf-8");

		const r = writeAtomic(dest, "NEW\n");
		expect(r.ok).toBe(true);

		// The destination now holds the new content (replace-over-existing).
		expect(readFileSync(dest, "utf-8")).toBe("NEW\n");
		// A successful rename consumes the temp file — none left behind.
		expect(existsSync(`${dest}${TMP_SUFFIX}`)).toBe(false);
	});

	test("writeAtomic to a fresh (non-existent) dest creates it", () => {
		dir = mkdtempSync(join(tmpdir(), "ms-atomic-"));
		const dest = join(dir, "marksync.lock.yml");
		expect(existsSync(dest)).toBe(false);

		const r = writeAtomic(dest, "FRESH\n");
		expect(r.ok).toBe(true);
		expect(readFileSync(dest, "utf-8")).toBe("FRESH\n");
	});
});

describe("writeAtomic — fs failure returns err(ConcurrentWrite)", () => {
	let dir: string;

	afterEach(() => {
		armCrashAfterTempWrite(false);
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	test("a temp write to a non-existent parent dir -> err(ConcurrentWrite), dest untouched", () => {
		dir = mkdtempSync(join(tmpdir(), "ms-atomic-"));
		// A dest whose parent directory does not exist — writeFileSync throws
		// ENOENT (real fs fault, no mock). writeAtomic surfaces it as the
		// lock-write arm; the destination is never created.
		const dest = join(dir, "no-such-dir", "marksync.lock.yml");
		expect(existsSync(dest)).toBe(false);

		const r = writeAtomic(dest, "X\n");
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe("ConcurrentWrite");
		expect(existsSync(dest)).toBe(false);
	});
});
