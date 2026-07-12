import { describe, it, expect } from "bun:test";
import { uuidV7Timestamp } from "#domain/identity/uuid";

describe("uuidV7Timestamp", () => {
	it("extracts timestamp from valid UUID v7", () => {
		// Real UUID v7 examples with embedded timestamps
		const uuid1 = "019f56e4-18f5-759b-bfdf-5438918bb3bc";
		const uuid2 = "019f56e5-18f5-759b-bfdf-5438918bb3bc";

		const ts1 = uuidV7Timestamp(uuid1);
		const ts2 = uuidV7Timestamp(uuid2);

		expect(ts1).toBeDefined();
		expect(ts2).toBeDefined();
		expect(typeof ts1).toBe("number");
		expect(typeof ts2).toBe("number");
	});

	it("extracts timestamp from op_-prefixed UUID v7", () => {
		// Operation-id format: op_<uuid-v7>
		const operationId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc";
		const ts = uuidV7Timestamp(operationId);
		expect(ts).toBeDefined();
	});

	it("orders timestamps correctly by UUID v7 prefix", () => {
		// Real UUID v7 with different timestamps (first 12 hex chars)
		const uuid1 = "019f56e4-18f5-759b-bfdf-5438918bb3bc";
		const uuid2 = "019f56e5-18f5-759b-bfdf-5438918bb3bc"; // One bit higher in timestamp

		const extracted1 = uuidV7Timestamp(uuid1);
		const extracted2 = uuidV7Timestamp(uuid2);

		expect(extracted1).toBeDefined();
		expect(extracted2).toBeDefined();
		expect(extracted2).toBeGreaterThan(extracted1!);
	});

	it("returns undefined for malformed UUID (wrong format)", () => {
		const malformed = "not-a-uuid";
		const ts = uuidV7Timestamp(malformed);
		expect(ts).toBeUndefined();
	});

	it("returns undefined for UUID v4 (wrong version)", () => {
		// UUID v4 has version 4 in the 13th position (after second dash)
		const uuidV4 = "550e8400-e29b-41d4-a716-446655440000";
		const ts = uuidV7Timestamp(uuidV4);
		expect(ts).toBeUndefined();
	});

	it("returns undefined for empty string", () => {
		const ts = uuidV7Timestamp("");
		expect(ts).toBeUndefined();
	});
});