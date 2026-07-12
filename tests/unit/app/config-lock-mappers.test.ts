// Unit tests for the ConfigError/LockError → ResultError bridge (GH-23).
// No mock: constructs real error shapes and exercises the mappers directly.

import { describe, expect, test } from "bun:test";
import { mapConfigError, mapLockError } from "#app/config-lock-mappers";
import type { ConfigAjvError, ConfigError } from "#domain/errors";

/** Minimal valid ConfigAjvError entry (count is the only structural signal used). */
function ajvError(message = "must be 1"): ConfigAjvError {
	return {
		instancePath: "/version",
		schemaPath: "#/properties/version",
		keyword: "const",
		message,
		params: {},
	};
}

function makeConfig(count: number): ConfigError {
	const ajvErrors: ConfigAjvError[] = [];
	for (let i = 0; i < count; i++) ajvErrors.push(ajvError());
	return {
		kind: "InvalidConfig",
		path: "marksync.yml",
		ajvErrors,
		humanMessage: "elided",
	};
}

describe("mapConfigError", () => {
	test("a single validation error → INVALID_CONFIG, not retryable, singular noun", () => {
		const out = mapConfigError(makeConfig(1));
		expect(out.code).toBe("INVALID_CONFIG");
		expect(out.retryable).toBe(false);
		expect(out.message).toMatch(/1 validation error/);
		expect(out.message).not.toMatch(/1 validation errors/);
	});

	test("multiple validation errors → INVALID_CONFIG, not retryable, plural noun", () => {
		const out = mapConfigError(makeConfig(3));
		expect(out.code).toBe("INVALID_CONFIG");
		expect(out.retryable).toBe(false);
		expect(out.message).toMatch(/3 validation errors/);
	});

	test("message references the count", () => {
		const out = mapConfigError(makeConfig(2));
		expect(out.message).toContain("2");
	});
});

describe("mapLockError — CorruptLock", () => {
	test("with a single ajv error → CORRUPT_LOCK, not retryable, singular noun", () => {
		const out = mapLockError({
			kind: "CorruptLock",
			path: "marksync.lock.yml",
			ajvErrors: [ajvError()],
			humanMessage: "elided",
		});
		expect(out.code).toBe("CORRUPT_LOCK");
		expect(out.retryable).toBe(false);
		expect(out.message).toMatch(/1 validation error/);
	});

	test("with multiple ajv errors → CORRUPT_LOCK, not retryable, plural noun", () => {
		const out = mapLockError({
			kind: "CorruptLock",
			path: "marksync.lock.yml",
			ajvErrors: [ajvError(), ajvError()],
			humanMessage: "elided",
		});
		expect(out.code).toBe("CORRUPT_LOCK");
		expect(out.retryable).toBe(false);
		expect(out.message).toMatch(/2 validation errors/);
	});

	test("with an empty ajvErrors array → CORRUPT_LOCK parse-error path", () => {
		const out = mapLockError({
			kind: "CorruptLock",
			path: "marksync.lock.yml",
			ajvErrors: [],
			humanMessage: "elided",
		});
		expect(out.code).toBe("CORRUPT_LOCK");
		expect(out.retryable).toBe(false);
		expect(out.message).toMatch(/parse error/);
	});

	test("with undefined ajvErrors (YAML parse failure) → CORRUPT_LOCK parse-error path", () => {
		const out = mapLockError({
			kind: "CorruptLock",
			path: "marksync.lock.yml",
			humanMessage: "elided",
		});
		expect(out.code).toBe("CORRUPT_LOCK");
		expect(out.retryable).toBe(false);
		expect(out.message).toMatch(/parse error/);
	});
});

describe("mapLockError — LockDirty / ConcurrentWrite (retryable)", () => {
	test("LockDirty → LOCK_DIRTY, retryable, repair guidance", () => {
		const out = mapLockError({
			kind: "LockDirty",
			path: ".marksync/lock.json",
		});
		expect(out.code).toBe("LOCK_DIRTY");
		expect(out.retryable).toBe(true);
		expect(out.message).toMatch(/dirty/i);
		expect(out.message).toContain("repair-state");
	});

	test("ConcurrentWrite → CONCURRENT_WRITE, retryable, names the lock path", () => {
		const out = mapLockError({
			kind: "ConcurrentWrite",
			lockPath: ".marksync/lock.json",
		});
		expect(out.code).toBe("CONCURRENT_WRITE");
		expect(out.retryable).toBe(true);
		expect(out.message).toContain(".marksync/lock.json");
		expect(out.message).toMatch(/concurrent write/i);
	});
});
