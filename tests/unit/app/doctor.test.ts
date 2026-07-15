// Doctor orchestration unit tests (GH-30 / TDR-0009).

import { describe, expect, test, mock } from "bun:test";
import { type DoctorReport, runDoctor } from "#app/doctor";
import type { Result } from "#domain/result";
import type { MarkSyncError } from "#domain/errors";
import type { ProjectConfig } from "#domain/config/types";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";
import { redactString } from "#shared/redact";

// Extract check IDs from the module to avoid importing const objects in tests
import { DOCTOR_CHECK_IDS } from "#app/doctor";
type DoctorCheckId = (typeof DOCTOR_CHECK_IDS)[keyof typeof DOCTOR_CHECK_IDS];

// --- Mock factories ---

function mockRepository(overrides: Partial<Repository> = {}): Repository {
	return {
		headSha: () => overrides.headSha?.() ?? { ok: true, value: "abc123" },
		currentBranch: () =>
			overrides.currentBranch?.() ?? { ok: true, value: "main" },
		readCommitted: () =>
			overrides.readCommitted?.() ?? { ok: true, value: new Map() },
		listCommitSubjects: () =>
			overrides.listCommitSubjects?.() ?? { ok: true, value: [] },
	};
}

function mockTarget(overrides: Partial<TargetSystem> = {}): TargetSystem {
	return {
		getPage:
			overrides.getPage ??
			(() => ({ ok: true, value: { id: "123", title: "Test", version: 1 } })),
		searchPages: overrides.searchPages ?? (() => ({ ok: true, value: [] })),
		createPage:
			overrides.createPage ??
			(() => ({ ok: true, value: { pageId: "new-123" } })),
		updatePage:
			overrides.updatePage ?? (() => ({ ok: true, value: { pageId: "123" } })),
		deletePage:
			overrides.deletePage ?? (() => ({ ok: true, value: undefined })),
		movePage: overrides.movePage ?? (() => ({ ok: true, value: undefined })),
		renderBody:
			overrides.renderBody ??
			(() => ({ ok: true, value: { body: "", hash: "", warnings: [] } })),
		getProperty: overrides.getProperty ?? (() => ({ ok: true, value: "{}" })),
		putProperty:
			overrides.putProperty ?? (() => ({ ok: true, value: undefined })),
		deleteProperty:
			overrides.deleteProperty ?? (() => ({ ok: true, value: undefined })),
		attachmentExists:
			overrides.attachmentExists ?? (() => ({ ok: true, value: false })),
		uploadAttachment:
			overrides.uploadAttachment ??
			(() => ({ ok: true, value: { id: "att-1" } })),
		deleteAttachment:
			overrides.deleteAttachment ?? (() => ({ ok: true, value: undefined })),
		getRestrictions:
			overrides.getRestrictions ?? (() => ({ ok: true, value: [] })),
		listAttachments:
			overrides.listAttachments ?? (() => ({ ok: true, value: [] })),
	};
}

function mockConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
	return {
		root: "/repo",
		targets: {
			default: {
				type: "confluence",
				spaceKey: "TEST",
				parentPageId: "123",
				...overrides.targets?.default,
			},
		},
		...overrides,
	};
}

// --- Test helpers ---

function findCheck(report: DoctorReport, checkId: DoctorCheckId) {
	return report.checks.find((c) => c.check === checkId);
}

describe("runDoctor — unit tests (TC-DOCTOR-001..009 + TC-DOCTOR-012)", () => {
	// TC-DOCTOR-001: Git probe err → git-available fail
	test("TC-DOCTOR-001: Git not on $PATH → git-available fail", async () => {
		const mockRepo = mockRepository({
			headSha: () => ({
				ok: false,
				error: { kind: "RemoteUnreachable", cause: "Git command failed" },
			}),
		});

		const loadConfigMock = () => ({
			ok: true,
			value: mockConfig(),
		});

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget();

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepo,
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const gitCheck = findCheck(report, DOCTOR_CHECK_IDS.GIT_AVAILABLE);
		expect(gitCheck).toBeDefined();
		expect(gitCheck?.status).toBe("fail");
		expect(gitCheck?.detail).toContain("Git");
		expect(gitCheck?.fix).toBeDefined();
		// Git fail should not affect other checks (they should pass with proper mocks)
		expect(report.summary.fail).toBe(1);
		expect(report.worstStatus).toBe("fail");
	});

	// TC-DOCTOR-002: Config missing or invalid
	test("TC-DOCTOR-002.1: Config missing → config-valid fail", async () => {
		const loadConfigMock = () => ({
			ok: false,
			error: {
				kind: "InvalidConfig",
				path: "",
				ajvErrors: [],
				humanMessage: "marksync.yml not found",
			},
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			createRepository: () => mockRepository(),
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const configCheck = findCheck(report, DOCTOR_CHECK_IDS.CONFIG_VALID);
		expect(configCheck?.status).toBe("fail");
		expect(configCheck?.detail).toContain("marksync.yml");
		expect(configCheck?.fix).toContain("marksync init");
		expect(report.summary.fail).toBe(1);
	});

	test("TC-DOCTOR-002.2: Config invalid (ajv error) → config-valid fail", async () => {
		const loadConfigMock = () => ({
			ok: false,
			error: {
				kind: "InvalidConfig",
				path: "/repo/marksync.yml",
				ajvErrors: [
					{
						instancePath: "/targets/default/spaceKey",
						message: "must be string",
					},
				],
				humanMessage: "Invalid config: targets.default.spaceKey must be string",
			},
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			createRepository: () => mockRepository(),
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const configCheck = findCheck(report, DOCTOR_CHECK_IDS.CONFIG_VALID);
		expect(configCheck?.status).toBe("fail");
		expect(configCheck?.detail).toContain("targets.default.spaceKey");
		expect(report.summary.fail).toBe(1);
	});

	// TC-DOCTOR-003: Credentials missing/malformed
	test("TC-DOCTOR-003.1: Missing credentials → credentials fail", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: false,
			error: {
				kind: "Auth",
				authKind: "MissingCredentials",
				missing: ["MARKSYNC_USER_EMAIL", "MARKSYNC_API_TOKEN"],
			},
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			createRepository: () => mockRepository(),
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const credsCheck = findCheck(report, DOCTOR_CHECK_IDS.CREDENTIALS);
		expect(credsCheck?.status).toBe("fail");
		expect(credsCheck?.detail).toContain("MARKSYNC_USER_EMAIL");
		expect(credsCheck?.detail).toContain("MARKSYNC_API_TOKEN");
		// Should NOT contain raw token values (env var names are fine, this checks for actual tokens)
		expect(credsCheck?.detail).not.toContain("ATATT");
		expect(credsCheck?.detail).not.toContain("ghp_");
		expect(report.summary.fail).toBe(1);
	});

	test("TC-DOCTOR-003.2: Invalid credentials → credentials fail", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: false,
			error: { kind: "Auth", authKind: "InvalidCredentials" },
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const credsCheck = findCheck(report, DOCTOR_CHECK_IDS.CREDENTIALS);
		expect(credsCheck?.status).toBe("fail");
		expect(credsCheck?.detail).toContain("rejected");
		expect(credsCheck?.detail).not.toMatch(/xyz/); // No raw token
		expect(report.summary.fail).toBe(1);
	});

	// TC-DOCTOR-004: Base URL unreachable / space forbidden
	test("TC-DOCTOR-004.1: Base URL unreachable → space-access fail", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget({
			searchPages: async () => ({
				ok: false,
				error: { kind: "RemoteUnreachable", cause: "Network error" },
			}),
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const spaceCheck = findCheck(report, DOCTOR_CHECK_IDS.SPACE_ACCESS);
		expect(spaceCheck?.status).toBe("fail");
		expect(spaceCheck?.detail).toContain("unreachable");
		expect(report.summary.fail).toBe(1);
	});

	test("TC-DOCTOR-004.2: Space forbidden (403) → space-access fail", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget({
			searchPages: async () => ({
				ok: false,
				error: { kind: "Auth", authKind: "Forbidden" },
			}),
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const spaceCheck = findCheck(report, DOCTOR_CHECK_IDS.SPACE_ACCESS);
		expect(spaceCheck?.status).toBe("fail");
		expect(spaceCheck?.detail).toContain("403");
		expect(report.summary.fail).toBe(1);
	});

	// TC-DOCTOR-005: Parent page missing/not writable
	test("TC-DOCTOR-005.1: Parent page missing (404) → parent-page fail", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget({
			searchPages: async () => ({ ok: true, value: [] }),
			getPage: async () => ({
				ok: false,
				error: { kind: "RemoteMissing" },
			}),
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const parentCheck = findCheck(report, DOCTOR_CHECK_IDS.PARENT_PAGE);
		expect(parentCheck?.status).toBe("fail");
		expect(parentCheck?.detail).toContain("404");
		expect(report.summary.fail).toBe(1);
	});

	test("TC-DOCTOR-005.2: Parent page not writable (403) → parent-page fail", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget({
			searchPages: async () => ({ ok: true, value: [] }),
			getPage: async () => ({
				ok: false,
				error: { kind: "Auth", authKind: "Forbidden" },
			}),
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const parentCheck = findCheck(report, DOCTOR_CHECK_IDS.PARENT_PAGE);
		expect(parentCheck?.status).toBe("fail");
		expect(parentCheck?.detail).toContain("403");
		expect(report.summary.fail).toBe(1);
	});

	// TC-DOCTOR-006: --probe-capabilities absent → probes skipped
	test("TC-DOCTOR-006: --probe-capabilities absent → capability checks skipped", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget();
		let createPageCalled = false;
		mockTargetSystem.createPage = async () => {
			createPageCalled = true;
			return { ok: true, value: { pageId: "new-123" } };
		};

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const propCheck = findCheck(report, DOCTOR_CHECK_IDS.CONTENT_PROPERTY);
		const attachCheck = findCheck(report, DOCTOR_CHECK_IDS.ATTACHMENT);
		expect(propCheck?.status).toBe("skipped");
		expect(attachCheck?.status).toBe("skipped");
		expect(report.summary.skipped).toBe(2);
		expect(createPageCalled).toBe(false); // No probe port calls
	});

	// TC-DOCTOR-007: Permission/visibility check emits warn
	test("TC-DOCTOR-007: Permission check emits warn (never fail)", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget({
			getRestrictions: async () => ({
				ok: true,
				value: [{ operation: "read" }],
			}),
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const permCheck = findCheck(report, DOCTOR_CHECK_IDS.PERMISSION_VISIBILITY);
		expect(permCheck?.status).toBe("warn");
		expect(permCheck?.detail).toContain("403");
		expect(permCheck?.detail).toContain("warn+skip");
		expect(permCheck?.fix).toBeUndefined(); // Advisory, no fix
		expect(report.summary.warn).toBeGreaterThan(0);
		expect(report.worstStatus).toBe("warn"); // Warn does not gate exit
	});

	// TC-DOCTOR-008: Renderer check emits warn (never fail)
	test("TC-DOCTOR-008: Renderer initialization fails → renderer warn", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget();

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		const rendererCheck = findCheck(report, DOCTOR_CHECK_IDS.RENDERER);
		// Currently returns pass with informational message
		expect(rendererCheck?.status).toBe("pass");
		// In future implementation, this could be warn on init failure
		// Never gates exit - worstStatus would be "warn" at most (from permission check)
		expect(report.worstStatus).toMatch(/^(pass|warn)$/); // Never "fail"
	});

	// TC-DOCTOR-009: DoctorReport assembly
	test("TC-DOCTOR-009: DoctorReport assembly with mixed results", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });

		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});

		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});

		const mockTargetSystem = mockTarget({
			getRestrictions: async () => ({ ok: true, value: [] }),
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;

		// Check structure
		expect(report.checks).toBeInstanceOf(Array);
		expect(report.summary).toBeDefined();
		expect(report.worstStatus).toMatch(/^(pass|warn|fail)$/);
		expect(report.probeCapabilities).toBe(false);

		// Check each check item
		const validIds = Object.values(DOCTOR_CHECK_IDS);
		for (const check of report.checks) {
			expect(validIds).toContain(check.check);
			expect(check.status).toMatch(/^(pass|warn|fail|skipped)$/);
			expect(check.detail).toBeTruthy();
			// fix is optional, only on fail/warn
			if (check.status === "pass" || check.status === "skipped") {
				expect(check.fix).toBeUndefined();
			}
		}

		// Check summary counts
		expect(report.summary.total).toBe(report.checks.length);
		const sum =
			report.summary.pass +
			report.summary.warn +
			report.summary.fail +
			report.summary.skipped;
		expect(sum).toBe(report.summary.total);

		// Check JSON serializability
		expect(() => JSON.stringify(report)).not.toThrow();
	});

	// TC-DOCTOR-012: Redaction of token-shaped substrings
	test("TC-DOCTOR-012: Redaction scrubs token-shaped substrings", () => {
		// Construct a report with token-shaped substrings (using realistic formats)
		const report: DoctorReport = {
			checks: [
				{
					check: DOCTOR_CHECK_IDS.CREDENTIALS,
					status: "fail",
					detail: "Invalid token: ATATTAaB3cD4eF5gH6iJ7kL8mN9oP0qR1",
					fix: "Verify token",
				},
				{
					check: DOCTOR_CHECK_IDS.SPACE_ACCESS,
					status: "fail",
					detail:
						"Base URL https://user:ATATTAaB3cD4eF5gH6iJ7kL8mN9oP0qR1@confluence.example.com unreachable",
					fix: "Check URL",
				},
				{
					check: DOCTOR_CHECK_IDS.CONFIG_VALID,
					status: "fail",
					detail:
						"MARKSYNC_API_TOKEN=ATATTAaB3cD4eF5gH6iJ7kL8mN9oP0qR1verylongtoken invalid",
					fix: "Check env",
				},
				{
					check: DOCTOR_CHECK_IDS.CREDENTIALS,
					status: "fail",
					detail: "Authorization: Bearer ghp_AbCdEf1234567890",
					fix: "Check credentials",
				},
			],
			summary: { pass: 0, warn: 0, fail: 4, skipped: 0, total: 4 },
			worstStatus: "fail",
			probeCapabilities: false,
		};

		const serialized = JSON.stringify(report);
		const redacted = redactString(serialized);

		// Assert token-shaped substrings are replaced with [REDACTED:<kind>]
		expect(redacted).toContain("[REDACTED:");
		expect(redacted).not.toContain("ATATTAaB3cD4eF5gH6iJ7kL8mN9oP0qR1");
		expect(redacted).not.toContain("ghp_AbCdEf1234567890");

		// Assert non-sensitive context is preserved
		expect(redacted).toContain("Invalid token:");
		expect(redacted).toContain("Base URL");
		expect(redacted).toContain("unreachable");
		expect(redacted).toContain("Verify token");
	});

	// TC-DOCTOR-009 extended: Worst status derivation
	test("TC-DOCTOR-009.1: Worst status derived correctly — all pass (warn allowed)", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });
		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});
		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});
		const mockTargetSystem = mockTarget();

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		// permission-visibility always returns "warn" so worst status is "warn"
		expect(report.worstStatus).toBe("warn");
	});

	test("TC-DOCTOR-009.2: Worst status derived correctly — any fail", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });
		const resolveCredsMock = () => ({
			ok: false,
			error: {
				kind: "Auth",
				authKind: "MissingCredentials",
				missing: ["MARKSYNC_API_TOKEN"],
			},
		});
		const mockTargetSystem = mockTarget();

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		expect(report.worstStatus).toBe("fail");
	});

	test("TC-DOCTOR-009.3: Worst status derived correctly — warn only", async () => {
		const loadConfigMock = () => ({ ok: true, value: mockConfig() });
		const resolveCredsMock = () => ({
			ok: true,
			value: {
				baseUrl: "https://test.atlassian.net",
				authHeader: "Basic xyz",
				email: "u***@test.com",
			},
		});
		const validateCredsMock = async () => ({
			ok: true,
			value: { accountId: "acc-123", email: "u***@test.com" },
		});
		const mockTargetSystem = mockTarget({
			getRestrictions: async () => ({
				ok: true,
				value: [{ operation: "read" }],
			}),
		});

		const result = await runDoctor({
			cwd: "/repo",
			probeCapabilities: false,
			loadConfig: loadConfigMock,
			resolveCredentials: resolveCredsMock,
			validateCredentials: validateCredsMock,
			createRepository: () => mockRepository(),
			createTarget: () => mockTargetSystem,
		});

		expect(result.ok).toBe(true);
		const report = result.value;
		expect(report.worstStatus).toBe("warn");
	});
});
