// tests/unit/domain/errors.test.ts
//
// Unit tests for the `InvalidConfig` (ConfigError) arm of the exhaustive
// `MarkSyncError` union (GH-15 F-7 / DM-3 / TC-CONFIG-007). Asserts:
//   - a `ConfigError` is a valid `MarkSyncError` `InvalidConfig` member;
//   - discriminating on `kind === "InvalidConfig"` narrows correctly at runtime;
//   - the required fields (`path`, `ajvErrors`, `humanMessage`) are present;
//   - the `ConfigAjvError` plain-data shape carries the structured entry.
//
// Exhaustive-union compile safety is enforced separately by `bun run typecheck`
// (TC-CONFIG-012 / NFR-3): the `never`-check in `assertNeverMarkSyncError` is
// the load-bearing guarantee that the union and the switch were updated together.

import { describe, expect, test } from "bun:test";
import { assertNeverMarkSyncError } from "#domain/errors";
import type {
	ConfigAjvError,
	ConfigError,
	LockError,
	MarkSyncError,
} from "#domain/errors";

describe("ConfigError (InvalidConfig kind)", () => {
	const sampleAjvError: ConfigAjvError = {
		instancePath: "/sync/granularity",
		schemaPath: "#/properties/sync/properties/granularity/enum",
		keyword: "enum",
		message: "must be equal to one of the allowed values",
		params: { allowedValues: ["squash"] },
	};

	const configError: ConfigError = {
		kind: "InvalidConfig",
		path: "marksync.yml",
		ajvErrors: [sampleAjvError],
		humanMessage:
			'sync.granularity: must be one of [squash] (got "batch"); suggested fix — set sync.granularity to "squash"',
	};

	test("a ConfigError is a valid MarkSyncError InvalidConfig member", () => {
		const asUnion: MarkSyncError = configError;
		expect(asUnion.kind).toBe("InvalidConfig");
	});

	test("discriminating on kind narrows to the ConfigError fields at runtime", () => {
		const err: MarkSyncError = configError;
		if (err.kind === "InvalidConfig") {
			expect(err.path).toBe("marksync.yml");
			expect(err.humanMessage).toBeTypeOf("string");
			expect(Array.isArray(err.ajvErrors)).toBe(true);
			expect(err.ajvErrors).toHaveLength(1);
		} else {
			expect.unreachable("expected InvalidConfig arm");
		}
	});

	test("required fields (path, ajvErrors, humanMessage) are present", () => {
		expect(configError).toHaveProperty("path");
		expect(configError).toHaveProperty("ajvErrors");
		expect(configError).toHaveProperty("humanMessage");
		expect(configError.kind).toBe("InvalidConfig");
	});

	test("ConfigAjvError entry is the structured, serializable shape", () => {
		const entry = configError.ajvErrors[0];
		expect(entry).toBeDefined();
		if (!entry) return; // narrow for noUncheckedIndexedAccess
		expect(entry.keyword).toBe("enum");
		expect(entry.instancePath).toBe("/sync/granularity");
		expect(entry.params).toEqual({ allowedValues: ["squash"] });
		// Must be JSON-serializable (it crosses the Result channel).
		expect(() => JSON.stringify(entry)).not.toThrow();
	});

	test("ConfigError flows through an exhaustive MarkSyncError handler", () => {
		const classify = (error: MarkSyncError): "config" | "other" => {
			switch (error.kind) {
				case "InvalidConfig":
					return "config";
				default:
					return assertNeverMarkSyncError(error) as never;
			}
		};
		expect(classify(configError)).toBe("config");
	});
});

describe("CorruptLock (lock-failure kind — GH-19 DEC-2)", () => {
	const corruptWithAjv: MarkSyncError = {
		kind: "CorruptLock",
		path: "marksync.lock.yml",
		ajvErrors: [
			{
				instancePath: "/version",
				schemaPath: "#/properties/version/const",
				keyword: "const",
				message: "must be equal to constant",
				params: { allowedValue: 1 },
			},
		],
		humanMessage: "version: must be 1, got 2",
	};

	const corruptParseOnly: MarkSyncError = {
		kind: "CorruptLock",
		path: "marksync.lock.yml",
		humanMessage: "invalid YAML: bad indentation",
	};

	test("a CorruptLock is a valid MarkSyncError member", () => {
		const asUnion: MarkSyncError = corruptWithAjv;
		expect(asUnion.kind).toBe("CorruptLock");
	});

	test("ajvErrors is optional — absent for a YAML parse failure (exactOptionalPropertyTypes)", () => {
		expect(corruptParseOnly.kind).toBe("CorruptLock");
		// `ajvErrors` is genuinely absent (not undefined) on the parse-only arm.
		expect("ajvErrors" in corruptParseOnly).toBe(false);
	});

	test("discriminating on kind narrows to the CorruptLock fields at runtime", () => {
		const err: MarkSyncError = corruptWithAjv;
		if (err.kind === "CorruptLock") {
			expect(err.path).toBe("marksync.lock.yml");
			expect(err.humanMessage).toBeTypeOf("string");
			expect(err.ajvErrors).toHaveLength(1);
		} else {
			expect.unreachable("expected CorruptLock arm");
		}
	});

	test("LockError narrows to the three lock arms (CorruptLock|LockDirty|ConcurrentWrite)", () => {
		const lockErrs: LockError[] = [
			corruptWithAjv as LockError,
			{ kind: "LockDirty", path: "x.md" },
			{ kind: "ConcurrentWrite", lockPath: "marksync.lock.yml" },
		];
		for (const e of lockErrs) {
			// LockError is a subset of MarkSyncError; every member is assignable up.
			const up: MarkSyncError = e;
			expect(["CorruptLock", "LockDirty", "ConcurrentWrite"]).toContain(
				up.kind,
			);
		}
	});

	test("CorruptLock flows through an exhaustive MarkSyncError handler (TC-CORRUPT-001 side-check)", () => {
		const classify = (error: MarkSyncError): "corrupt" | "other" => {
			switch (error.kind) {
				case "CorruptLock":
					return "corrupt";
				default:
					return assertNeverMarkSyncError(error) as never;
			}
		};
		expect(classify(corruptWithAjv)).toBe("corrupt");
		expect(classify(corruptParseOnly)).toBe("corrupt");
	});
});
