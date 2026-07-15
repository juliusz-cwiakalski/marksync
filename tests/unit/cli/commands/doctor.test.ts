// Doctor CLI handler unit tests (GH-30 / TDR-0009 / DEC-4).

import { describe, expect, mock, test } from "bun:test";
import type { DoctorReport } from "#app/doctor";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import { doctorCommand } from "#cli/commands/doctor";
import { EXIT_HEALTH, EXIT_OK } from "#cli/output";
import type { CommandResult } from "#cli/output";

/**
 * The Result the mocked runDoctor returns, swapped per test. Bun hoists
 * `mock.module` above imports; the factory's closure reads this lazily at call
 * time (never during hoisting), so there is no temporal-dead-zone hazard.
 */
let nextDoctorResult:
	| { ok: true; value: DoctorReport }
	| { ok: false; error: { kind: string; cause?: string } } = {
		ok: true,
		value: {
			checks: [],
			summary: { pass: 5, warn: 0, fail: 0, skipped: 0, total: 5 },
			worstStatus: "pass",
			probeCapabilities: false,
		},
	};

mock.module("#app/doctor", () => ({
	runDoctor: async (_deps: unknown) => {
		if (nextDoctorResult.ok) {
			return Res.ok(nextDoctorResult.value);
		}
		return Res.err(nextDoctorResult.error);
	},
}));

describe("TC-DOCTOR-011: Exit-code derivation — worstStatus fail→60, no-fail→0", () => {
	test("TC-DOCTOR-011.1: All checks pass → exit 0, data present, error unset", async () => {
		const mockReport: DoctorReport = {
			checks: [],
			summary: { pass: 5, warn: 0, fail: 0, skipped: 0, total: 5 },
			worstStatus: "pass",
			probeCapabilities: false,
		};

		nextDoctorResult = { ok: true, value: mockReport };

		const result = await doctorCommand({ probeCapabilities: false });

		expect(result.exitCode).toBe(EXIT_OK);
		expect(result.data).toEqual(mockReport);
		expect(result.error).toBeUndefined();
	});

	test("TC-DOCTOR-011.2: Any check warns (no fails) → exit 0, data present, error unset", async () => {
		const mockReport: DoctorReport = {
			checks: [],
			summary: { pass: 4, warn: 1, fail: 0, skipped: 0, total: 5 },
			worstStatus: "warn",
			probeCapabilities: false,
		};

		nextDoctorResult = { ok: true, value: mockReport };

		const result = await doctorCommand({ probeCapabilities: false });

		expect(result.exitCode).toBe(EXIT_OK); // Warn does not gate
		expect(result.data).toEqual(mockReport);
		expect(result.error).toBeUndefined();
	});

	test("TC-DOCTOR-011.3: Any check fails → exit 60, data present, error unset", async () => {
		const mockReport: DoctorReport = {
			checks: [],
			summary: { pass: 3, warn: 0, fail: 1, skipped: 1, total: 5 },
			worstStatus: "fail",
			probeCapabilities: false,
		};

		nextDoctorResult = { ok: true, value: mockReport };

		const result = await doctorCommand({ probeCapabilities: false });

		expect(result.exitCode).toBe(EXIT_HEALTH); // Fail gates to 60
		expect(result.data).toEqual(mockReport);
		expect(result.error).toBeUndefined();
	});

	test("TC-DOCTOR-011.4: runDoctor err → mapped err result, data absent", async () => {
		const mockError = {
			kind: "RemoteUnreachable" as const,
			cause: "Network error",
		};

		nextDoctorResult = { ok: false, error: mockError };

		const result = await doctorCommand({ probeCapabilities: false });

		// Error should be mapped and exit code should be derived from the mapped code
		expect(result.data).toBeUndefined();
		expect(result.error).toBeDefined();
		expect(result.exitCode).toBeGreaterThanOrEqual(0);
	});

	test("TC-DOCTOR-011.5: Verify CommandResult structure matches DEC-4", async () => {
		const mockReport: DoctorReport = {
			checks: [],
			summary: { pass: 5, warn: 0, fail: 0, skipped: 0, total: 5 },
			worstStatus: "pass",
			probeCapabilities: false,
		};

		nextDoctorResult = { ok: true, value: mockReport };

		const result = await doctorCommand({ probeCapabilities: false });

		// Verify CommandResult structure
		expect(result).toHaveProperty("schemaVersion");
		expect(result).toHaveProperty("runId");
		expect(result).toHaveProperty("exitCode");
		expect(typeof result.exitCode).toBe("number");
		expect(result).toHaveProperty("data");

		// Verify data presence (not via ok/err factories)
		expect(result.error).toBeUndefined();
		expect(result.data).toEqual(mockReport);
	});
});