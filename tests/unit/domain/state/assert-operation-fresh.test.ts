import { describe, it, expect } from "bun:test";
import { assertOperationFresh } from "#domain/state/operation-freshness";

describe("assertOperationFresh", () => {
	describe("remote newer → stale (TC-CONC-001)", () => {
		it("returns StalePlan when remote operation-id is newer", () => {
			// Plan at T1, remote at T2 > T1
			const planOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc";
			const remoteOpId = "op_019f56e5-18f5-759b-bfdf-5438918bb3bc";

			const result = assertOperationFresh(planOpId, remoteOpId);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("StalePlan");
				expect(result.error.operationId).toBe(planOpId);
				expect(result.error.expiredAt).toBe(""); // Not an expiry case
			}
		});
	});

	describe("remote older/equal → fresh (TC-CONC-002)", () => {
		it("returns ok when plan is newer than remote", () => {
			// Plan at T2, remote at T1 < T2
			const planOpId = "op_019f56e5-18f5-759b-bfdf-5438918bb3bc";
			const remoteOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc";

			const result = assertOperationFresh(planOpId, remoteOpId);

			expect(result.ok).toBe(true);
		});

		it("returns ok when operation-ids are equal (idempotency)", () => {
			const planOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc";
			const remoteOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc";

			const result = assertOperationFresh(planOpId, remoteOpId);

			expect(result.ok).toBe(true);
		});
	});

	describe("missing remote property → fresh (TC-CONC-003)", () => {
		it("returns ok when remote operation-id is undefined (first publish)", () => {
			const planOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc";

			const result = assertOperationFresh(planOpId, undefined);

			expect(result.ok).toBe(true);
		});
	});

	describe("malformed inputs → fresh (TC-CONC-004)", () => {
		it("returns ok when plan operation-id is malformed", () => {
			const malformedPlanId = "op_not-a-uuid-v7";
			const remoteOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc";

			const result = assertOperationFresh(malformedPlanId, remoteOpId);

			// Cannot prove staleness → fresh
			expect(result.ok).toBe(true);
		});

		it("returns ok when remote operation-id is malformed", () => {
			const planOpId = "op_019f56e4-18f5-759b-bfdf-5438918bb3bc";
			const malformedRemoteId = "op_not-a-uuid-v7";

			const result = assertOperationFresh(planOpId, malformedRemoteId);

			// Cannot prove staleness → fresh
			expect(result.ok).toBe(true);
		});

		it("returns ok when both operation-ids are malformed", () => {
			const malformedPlanId = "op_not-a-uuid-v7";
			const malformedRemoteId = "op_another-invalid";

			const result = assertOperationFresh(malformedPlanId, malformedRemoteId);

			// Cannot prove staleness → fresh
			expect(result.ok).toBe(true);
		});

		it("handles operation-ids without op_ prefix gracefully", () => {
			const planOpId = "019f56e4-18f5-759b-bfdf-5438918bb3bc";
			const remoteOpId = "019f56e5-18f5-759b-bfdf-5438918bb3bc";

			const result = assertOperationFresh(planOpId, remoteOpId);

			// Should still work (extract timestamp from bare UUID)
			// Remote UUID is provably newer (019f56e5 > 019f56e4)
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("StalePlan");
				expect(result.error.operationId).toBe(planOpId);
			}
		});
	});
});
