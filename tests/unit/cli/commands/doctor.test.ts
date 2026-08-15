// Doctor CLI handler unit tests (GH-30 / TDR-0009 / DEC-4).
//
// Exit-code derivation is driven by an injected runDoctor stub (DEC-4 seam).
// Never use `mock.module` here: it is process-global under bun:test workers,
// cannot be restored, and leaks into any test file later loaded by the same
// worker (the cause of the PR #102 CI doctor flakes).

import { describe, expect, test } from "bun:test";
import type { DoctorReport } from "#app/doctor";
import type { MarkSyncError } from "#domain/errors";
import type { Result } from "#domain/result";
import { Result as Res } from "#domain/result";
import { doctorCommand } from "#cli/commands/doctor";
import { EXIT_HEALTH, EXIT_OK } from "#cli/output";
import type { CommandResult } from "#cli/output";

/** The Result the stubbed runDoctor returns, swapped per test. */
let nextDoctorResult: Result<DoctorReport, MarkSyncError> = Res.ok({
	checks: [],
	summary: { pass: 5, warn: 0, fail: 0, skipped: 0, total: 5 },
	worstStatus: "pass",
	probeCapabilities: false,
});

const stubRunDoctor: typeof import("#app/doctor").runDoctor = async () =>
	nextDoctorResult;

describe("TC-DOCTOR-011: Exit-code derivation — worstStatus fail→60, no-fail→0", () => {
	test("TC-DOCTOR-011.1: All checks pass → exit 0, data present, error unset", async () => {
		const mockReport: DoctorReport = {
			checks: [],
			summary: { pass: 5, warn: 0, fail: 0, skipped: 0, total: 5 },
			worstStatus: "pass",
			probeCapabilities: false,
		};

		nextDoctorResult = Res.ok(mockReport);

		const result = await doctorCommand(
			{ probeCapabilities: false },
			{ runDoctor: stubRunDoctor },
		);

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

		nextDoctorResult = Res.ok(mockReport);

		const result = await doctorCommand(
			{ probeCapabilities: false },
			{ runDoctor: stubRunDoctor },
		);

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

		nextDoctorResult = Res.ok(mockReport);

		const result = await doctorCommand(
			{ probeCapabilities: false },
			{ runDoctor: stubRunDoctor },
		);

		expect(result.exitCode).toBe(EXIT_HEALTH); // Fail gates to 60
		expect(result.data).toEqual(mockReport);
		expect(result.error).toBeUndefined();
	});

	test("TC-DOCTOR-011.4: runDoctor err → mapped err result, data absent", async () => {
		nextDoctorResult = Res.err({
			kind: "RemoteUnreachable",
			cause: "Network error",
		});

		const result = await doctorCommand(
			{ probeCapabilities: false },
			{ runDoctor: stubRunDoctor },
		);

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

		nextDoctorResult = Res.ok(mockReport);

		const result = await doctorCommand(
			{ probeCapabilities: false },
			{ runDoctor: stubRunDoctor },
		);

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
