// writeAtomic — POSIX-atomic lock write (ADR-0006: "interrupted lock write
// preserves old file"). Writes a temp file then fs.rename over the destination;
// a module-level crash hook lets tests prove no partial lock survives a
// mid-write fault.

import { renameSync, writeFileSync } from "node:fs";
import type { LockError } from "#domain/errors";
import { Result } from "#domain/result";

/** Temp suffix — the abandoned-on-crash file is `${dest}.marksync-tmp`. */
const TMP_SUFFIX = ".marksync-tmp";

// Test-only fault-injection hook (TC-ATOMIC-001). Off by default; when armed,
// writeAtomic throws AFTER the temp write and BEFORE the rename, so a test can
// assert the destination is untouched and the temp file is abandoned. A real
// process crash would not return, so the hook throws rather than returns err.
let __marksync_test_crash_after_temp_write = false;

/** Arm/disarm the post-temp-write crash hook. Test-only. */
export function armCrashAfterTempWrite(enabled: boolean): void {
	__marksync_test_crash_after_temp_write = enabled;
}

/**
 * Write `data` to `dest` atomically: write `${dest}.marksync-tmp`, then
 * `fs.rename(tmp, dest)` (POSIX-atomic; Bun handles replace-over-existing
 * cross-OS). Returns `ok` on success or `err(ConcurrentWrite)` on an fs failure
 * — the lock-write arm, since a failed atomic write leaves the lock in an
 * uncertain state the caller should treat like a concurrency failure. The
 * injected crash hook (above) throws instead of returning.
 */
export function writeAtomic(
	dest: string,
	data: string,
): Result<void, LockError> {
	const tmp = `${dest}${TMP_SUFFIX}`;
	try {
		writeFileSync(tmp, data, "utf-8");
	} catch {
		return fsWriteError(dest);
	}

	if (__marksync_test_crash_after_temp_write) {
		// Simulate a process crash between the temp write and the rename: the
		// destination is never touched and the temp file is abandoned.
		throw new Error("__marksync_test_crash_after_temp_write");
	}

	try {
		renameSync(tmp, dest);
	} catch {
		return fsWriteError(dest);
	}
	return Result.ok(undefined);
}

/** Map an fs failure to the lock-write arm (no dedicated IOError arm exists). */
function fsWriteError(dest: string): Result<void, LockError> {
	return Result.err({ kind: "ConcurrentWrite", lockPath: dest });
}
