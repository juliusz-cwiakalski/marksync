// Unit tests for UUID v7 generation + validation (GH-18 F-1 / TC-UUID-001..005).
// Exercises the real `uuid` v7() — no mocks.

import { describe, expect, test } from "bun:test";
import {
	assertUuidV7,
	generateUuidV7,
	isUuidV7,
	UUID_V7_REGEX,
} from "#domain/identity/uuid";

/** Extract the 48-bit unix-ms prefix (first 12 hex chars) as a number. */
function timestampOf(uuid: string): number {
	return Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16);
}

describe("generateUuidV7 / isUuidV7 / assertUuidV7", () => {
	test("TC-UUID-001: every generated value matches the v7 regex with correct version/variant bits", () => {
		for (let i = 0; i < 100; i++) {
			const u = generateUuidV7();
			expect(UUID_V7_REGEX.test(u)).toBe(true);
			expect(u).toHaveLength(36);
			expect(u[14]).toBe("7");
			expect("89ab").toContain(u[19] ?? "");
		}
	});

	test("TC-UUID-002: two calls separated by >=1ms are time-sortable (non-decreasing 48-bit ms prefix)", async () => {
		const a = generateUuidV7();
		await new Promise((r) => setTimeout(r, 5));
		const b = generateUuidV7();
		expect(timestampOf(b)).toBeGreaterThanOrEqual(timestampOf(a));
	});

	test("TC-UUID-002b: a batch is monotonic non-decreasing by timestamp prefix", () => {
		const values = Array.from({ length: 50 }, () => generateUuidV7());
		const ts = values.map(timestampOf);
		for (let i = 1; i < ts.length; i++) {
			expect(ts[i] ?? 0).toBeGreaterThanOrEqual(ts[i - 1] ?? 0);
		}
	});

	test("TC-UUID-003: isUuidV7 accepts valid v7 and rejects everything else", () => {
		expect(isUuidV7(generateUuidV7())).toBe(true);
		expect(isUuidV7("0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d")).toBe(true);
		// v4 — wrong version nibble.
		expect(isUuidV7("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
		// nil uuid.
		expect(isUuidV7("00000000-0000-0000-0000-000000000000")).toBe(false);
		// truncated / empty / non-uuid.
		expect(isUuidV7("0192b3d4")).toBe(false);
		expect(isUuidV7("")).toBe(false);
		expect(isUuidV7("not-a-uuid-at-all")).toBe(false);
		// v7 with wrong variant digit (the 17th hex must be in [89ab]).
		expect(isUuidV7("0192b3d4-5e6f-7a8b-cdef-0123456789ab")).toBe(false);
		// v7 shape but wrong version nibble (8 instead of 7).
		expect(isUuidV7("0192b3d4-5e6f-8a8b-9c0d-1e2f3a4b5c6d")).toBe(false);
	});

	test("TC-UUID-004: assertUuidV7 narrows on valid and throws on malformed", () => {
		const valid = generateUuidV7();
		expect(() => assertUuidV7(valid)).not.toThrow();
		// The assertion narrows `string` to DocumentId (brand is opaque).
		const s: string = valid;
		assertUuidV7(s);
		expect(() => assertUuidV7("not-a-uuid")).toThrow();
	});

	test("TC-UUID-005: 1000 calls produce 1000 distinct strings", () => {
		const values = new Set(
			Array.from({ length: 1000 }, () => generateUuidV7()),
		);
		expect(values.size).toBe(1000);
	});
});
