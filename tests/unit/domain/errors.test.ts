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
