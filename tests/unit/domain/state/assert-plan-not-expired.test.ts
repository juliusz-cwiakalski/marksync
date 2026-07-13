import { describe, it, expect } from "bun:test";
import { assertPlanNotExpired } from "#domain/state/plan-expiry";

describe("assertPlanNotExpired", () => {
	describe("at boundary → expired (TC-EXPIRY-001)", () => {
		it("returns StalePlan at exactly the window boundary (conservative)", () => {
			const now = 1_726_000_000_000;
			const stalePlanMinutes = 15;
			// Plan timestamp such that now - planTimestamp = 15 minutes
			const planTimestamp = now - stalePlanMinutes * 60_000;

			const result = assertPlanNotExpired(planTimestamp, now, stalePlanMinutes);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("StalePlan");
				expect(result.error.operationId).toBe("");
				expect(result.error.expiredAt).toBe(
					new Date(planTimestamp + stalePlanMinutes * 60_000).toISOString(),
				);
			}
		});
	});

	describe("over window → expired (TC-EXPIRY-002)", () => {
		it("returns StalePlan when plan is older than the window", () => {
			const now = 1_726_000_000_000;
			const stalePlanMinutes = 15;
			// Plan timestamp such that now - planTimestamp = 20 minutes (over window)
			const planTimestamp = now - 20 * 60_000;

			const result = assertPlanNotExpired(planTimestamp, now, stalePlanMinutes);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("StalePlan");
				expect(result.error.expiredAt).toBe(
					new Date(planTimestamp + stalePlanMinutes * 60_000).toISOString(),
				);
			}
		});

		it("returns StalePlan with large expiry (1 hour old, 15 min window)", () => {
			const now = 1_726_000_000_000;
			const stalePlanMinutes = 15;
			const planTimestamp = now - 60 * 60_000; // 1 hour ago

			const result = assertPlanNotExpired(planTimestamp, now, stalePlanMinutes);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("StalePlan");
			}
		});
	});

	describe("under window → fresh (TC-EXPIRY-003)", () => {
		it("returns ok when plan is within the window", () => {
			const now = 1_726_000_000_000;
			const stalePlanMinutes = 15;
			// Plan timestamp such that now - planTimestamp = 10 minutes (under window)
			const planTimestamp = now - 10 * 60_000;

			const result = assertPlanNotExpired(planTimestamp, now, stalePlanMinutes);

			expect(result.ok).toBe(true);
		});

		it("returns ok for a very fresh plan (1 minute old)", () => {
			const now = 1_726_000_000_000;
			const stalePlanMinutes = 15;
			const planTimestamp = now - 60_000; // 1 minute ago

			const result = assertPlanNotExpired(planTimestamp, now, stalePlanMinutes);

			expect(result.ok).toBe(true);
		});

		it("returns ok for plan from the future (clock skew)", () => {
			const now = 1_726_000_000_000;
			const stalePlanMinutes = 15;
			const planTimestamp = now + 60_000; // 1 minute in the future

			const result = assertPlanNotExpired(planTimestamp, now, stalePlanMinutes);

			expect(result.ok).toBe(true);
		});
	});

	describe("different window sizes", () => {
		it("respects custom stalePlanMinutes value", () => {
			const now = 1_726_000_000_000;
			const stalePlanMinutes = 30;
			// Plan is 20 minutes old (under 30-min window)
			const planTimestamp = now - 20 * 60_000;

			const result = assertPlanNotExpired(planTimestamp, now, stalePlanMinutes);

			expect(result.ok).toBe(true);
		});

		it("treats plan as expired when window is small", () => {
			const now = 1_726_000_000_000;
			const stalePlanMinutes = 5;
			// Plan is 10 minutes old (over 5-min window)
			const planTimestamp = now - 10 * 60_000;

			const result = assertPlanNotExpired(planTimestamp, now, stalePlanMinutes);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.kind).toBe("StalePlan");
			}
		});
	});
});
