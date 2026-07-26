// Doctor orchestration (GH-30 / TDR-0009 / ADR-0011).

import type { Result } from "#domain/result";
import type { AuthError, ConfigError, MarkSyncError } from "#domain/errors";
import type {
	AccountIdentity,
	ConfluenceCredentials,
} from "#domain/credentials";
import { Result as Res } from "#domain/result";
import type { Repository } from "#domain/git/port";
import type { TargetSystem } from "#domain/target/port";
import type { ProjectConfig } from "#domain/config/types";

/** Stable check-id set — no magic strings (typescript.md). */
export const DOCTOR_CHECK_IDS = {
	GIT_AVAILABLE: "git-available",
	CONFIG_VALID: "config-valid",
	CREDENTIALS: "credentials",
	SPACE_ACCESS: "space-access",
	PARENT_PAGE: "parent-page",
	CONTENT_PROPERTY: "content-property",
	ATTACHMENT: "attachment",
	PERMISSION_VISIBILITY: "permission-visibility",
	RENDERER: "renderer",
} as const;

export type DoctorCheckId =
	(typeof DOCTOR_CHECK_IDS)[keyof typeof DOCTOR_CHECK_IDS];

export type DoctorStatus = "pass" | "warn" | "fail" | "skipped";

/** Per-check result (DM-2). */
export interface DoctorCheck {
	check: DoctorCheckId;
	status: DoctorStatus;
	detail: string;
	fix?: string;
}

/** Summary counts (DM-1). */
export interface DoctorSummary {
	pass: number;
	warn: number;
	fail: number;
	skipped: number;
	total: number;
}

/** Doctor report (DM-1). */
export interface DoctorReport {
	checks: DoctorCheck[];
	summary: DoctorSummary;
	worstStatus: "pass" | "warn" | "fail";
	probeCapabilities: boolean;
}

/** Injectable dependencies for test isolation. */
export interface DoctorDeps {
	cwd: string;
	probeCapabilities: boolean;
	fetch?: typeof fetch;
	loadConfig?: (cwd: string) => Result<ProjectConfig, MarkSyncError>;
	resolveCredentials?: () => Result<ConfluenceCredentials, AuthError>;
	validateCredentials?: (
		creds: ConfluenceCredentials,
		options?: { fetch?: typeof fetch },
	) => Promise<Result<AccountIdentity, AuthError>>;
	createRepository?: (repoPath: string) => Repository;
	createTarget?: (
		creds: ConfluenceCredentials,
		spaceKey: string,
	) => TargetSystem;
}

/** Resolve worst status from checks. */
function deriveWorstStatus(
	checks: readonly DoctorCheck[],
): "pass" | "warn" | "fail" {
	const statuses = checks.map((c) => c.status);
	if (statuses.includes("fail")) return "fail";
	if (statuses.includes("warn")) return "warn";
	return "pass";
}

/** Compute summary counts. */
function computeSummary(checks: readonly DoctorCheck[]): DoctorSummary {
	return {
		pass: checks.filter((c) => c.status === "pass").length,
		warn: checks.filter((c) => c.status === "warn").length,
		fail: checks.filter((c) => c.status === "fail").length,
		skipped: checks.filter((c) => c.status === "skipped").length,
		total: checks.length,
	};
}

/** The always-on advisory checks (warn-only / informational). */
function advisoryChecks(): DoctorCheck[] {
	return [
		{
			check: DOCTOR_CHECK_IDS.PERMISSION_VISIBILITY,
			status: "warn",
			detail:
				"Assuming full read access to the configured subtree; a 403 will be treated as warn+skip, not delete (R-FEA-10)",
		},
		{
			check: DOCTOR_CHECK_IDS.RENDERER,
			status: "pass",
			detail: "Renderer availability informational (check not yet implemented)",
		},
	];
}

/** Extract spaceKey from config or return err. */
function extractSpaceKey(config: ProjectConfig): Result<string, ConfigError> {
	const targetConfig = config.targets.default;
	if (!targetConfig) {
		return Res.err({
			kind: "InvalidConfig",
			path: "",
			ajvErrors: [],
			humanMessage: "No default target configured",
		});
	}
	if (!targetConfig.spaceKey) {
		return Res.err({
			kind: "InvalidConfig",
			path: "",
			ajvErrors: [],
			humanMessage: "Default target missing spaceKey",
		});
	}
	return Res.ok(targetConfig.spaceKey);
}

/** Extract parentPageId from config or return err. */
function extractParentPageId(
	config: ProjectConfig,
): Result<string, ConfigError> {
	const targetConfig = config.targets.default;
	if (!targetConfig) {
		return Res.err({
			kind: "InvalidConfig",
			path: "",
			ajvErrors: [],
			humanMessage: "No default target configured",
		});
	}
	if (!targetConfig.parentPageId) {
		return Res.err({
			kind: "InvalidConfig",
			path: "",
			ajvErrors: [],
			humanMessage: "Default target missing parentPageId",
		});
	}
	return Res.ok(targetConfig.parentPageId);
}

/**
 * Run the doctor health-check orchestration.
 * Returns `ok(report)` on the normal path (every classifiable failure is a per-check `fail`).
 * The `err` arm is reserved only for failures that cannot be classified into a check.
 */
export async function runDoctor(
	deps: DoctorDeps,
): Promise<Result<DoctorReport, MarkSyncError>> {
	const {
		cwd,
		probeCapabilities,
		fetch = globalThis.fetch,
		loadConfig: loadConfigImpl,
		resolveCredentials: resolveCredsImpl,
		validateCredentials: validateCredsImpl,
		createRepository: createRepoImpl,
		createTarget: createTargetImpl,
	} = deps;

	// Import real implementations by default (injectable for tests)
	const { loadConfig } = await import("#app/config");
	const { resolveCredentials, validateCredentials } = await import(
		"#app/credentials"
	);
	const { createRepository, createTarget } = await import("#app/ports");

	const checks: DoctorCheck[] = [];

	// --- Check 1: git-available ---
	const createRepo = createRepoImpl ?? createRepository;
	const repo = createRepo(cwd);
	const gitShaResult = repo.headSha();
	if (!gitShaResult.ok) {
		const isGitNotOnPath = gitShaResult.error.kind === "RemoteUnreachable";
		checks.push({
			check: DOCTOR_CHECK_IDS.GIT_AVAILABLE,
			status: "fail",
			detail: isGitNotOnPath
				? "Git is not on $PATH"
				: "Working directory is not inside a Git repository",
			fix: isGitNotOnPath
				? "Install Git and run from inside a Git working tree"
				: "Run from inside a Git repository",
		});
	} else {
		checks.push({
			check: DOCTOR_CHECK_IDS.GIT_AVAILABLE,
			status: "pass",
			detail: `Git repository detected, HEAD at ${gitShaResult.value.slice(0, 8)}`,
		});
	}

	// --- Check 2: config-valid ---
	const loadCfg = loadConfigImpl ?? loadConfig;
	const configResult = loadCfg(cwd);
	if (!configResult.ok) {
		const humanMessage =
			configResult.error.kind === "InvalidConfig"
				? configResult.error.humanMessage
				: `marksync.yml not found or unreadable`;
		checks.push({
			check: DOCTOR_CHECK_IDS.CONFIG_VALID,
			status: "fail",
			detail: `Config validation failed: ${humanMessage}`,
			fix: "Run `marksync init` to create marksync.yml, or fix the validation error",
		});
	} else {
		checks.push({
			check: DOCTOR_CHECK_IDS.CONFIG_VALID,
			status: "pass",
			detail: "marksync.yml is present and valid",
		});
	}

	// If config is invalid, skip downstream checks that depend on it
	if (!configResult.ok) {
		checks.push(
			{
				check: DOCTOR_CHECK_IDS.CREDENTIALS,
				status: "skipped",
				detail: "Skipped: config validation failed",
			},
			{
				check: DOCTOR_CHECK_IDS.SPACE_ACCESS,
				status: "skipped",
				detail: "Skipped: config validation failed",
			},
			{
				check: DOCTOR_CHECK_IDS.PARENT_PAGE,
				status: "skipped",
				detail: "Skipped: config validation failed",
			},
			{
				check: DOCTOR_CHECK_IDS.CONTENT_PROPERTY,
				status: "skipped",
				detail: "Skipped: config validation failed",
			},
			{
				check: DOCTOR_CHECK_IDS.ATTACHMENT,
				status: "skipped",
				detail: "Skipped: config validation failed",
			},
			...advisoryChecks(),
		);

		return Res.ok({
			checks,
			summary: computeSummary(checks),
			worstStatus: deriveWorstStatus(checks),
			probeCapabilities,
		});
	}

	const config = configResult.value;

	// --- Check 3: credentials ---
	const resolveCreds = resolveCredsImpl ?? resolveCredentials;
	const credsResult = resolveCreds();
	let creds: ConfluenceCredentials | null = null;
	if (!credsResult.ok) {
		const missing =
			credsResult.error.authKind === "MissingCredentials"
				? credsResult.error.missing.join(", ")
				: "MARKSYNC_USER_EMAIL, MARKSYNC_API_TOKEN, MARKSYNC_CONFLUENCE_BASE_URL";
		checks.push({
			check: DOCTOR_CHECK_IDS.CREDENTIALS,
			status: "fail",
			detail: `Missing environment variables: ${missing}`,
			fix: `Set the missing environment variables: ${missing}`,
		});
	} else {
		const validateCreds = validateCredsImpl ?? validateCredentials;
		const validation = await validateCreds(credsResult.value, { fetch });
		if (!validation.ok) {
			const isInvalid = validation.error.authKind === "InvalidCredentials";
			const isUnreachable = validation.error.authKind === "AuthUnreachable";
			checks.push({
				check: DOCTOR_CHECK_IDS.CREDENTIALS,
				status: "fail",
				detail: isInvalid
					? "Confluence rejected the credentials"
					: isUnreachable
						? "Auth endpoint unreachable"
						: `Authentication failed: ${validation.error.authKind}`,
				fix: isInvalid
					? "Verify MARKSYNC_API_TOKEN and MARKSYNC_CONFLUENCE_BASE_URL"
					: isUnreachable
						? "Check network connectivity and MARKSYNC_CONFLUENCE_BASE_URL"
						: "Verify credentials configuration",
			});
		} else {
			creds = credsResult.value;
			checks.push({
				check: DOCTOR_CHECK_IDS.CREDENTIALS,
				status: "pass",
				detail: `Authenticated as ${validation.value.displayName}`,
			});
		}
	}

	// Skip downstream checks if credentials failed (resolution or validation).
	if (!creds) {
		checks.push(
			{
				check: DOCTOR_CHECK_IDS.SPACE_ACCESS,
				status: "skipped",
				detail: "Skipped: credentials validation failed",
			},
			{
				check: DOCTOR_CHECK_IDS.PARENT_PAGE,
				status: "skipped",
				detail: "Skipped: credentials validation failed",
			},
			{
				check: DOCTOR_CHECK_IDS.CONTENT_PROPERTY,
				status: "skipped",
				detail: "Skipped: credentials validation failed",
			},
			{
				check: DOCTOR_CHECK_IDS.ATTACHMENT,
				status: "skipped",
				detail: "Skipped: credentials validation failed",
			},
			...advisoryChecks(),
		);

		return Res.ok({
			checks,
			summary: computeSummary(checks),
			worstStatus: deriveWorstStatus(checks),
			probeCapabilities,
		});
	}

	const createTargetFn = createTargetImpl ?? createTarget;

	// --- Check 4: space-access ---
	const spaceKeyResult = extractSpaceKey(config);
	const spaceKey = spaceKeyResult.ok ? spaceKeyResult.value : null;
	if (!spaceKeyResult.ok) {
		checks.push({
			check: DOCTOR_CHECK_IDS.SPACE_ACCESS,
			status: "fail",
			detail: spaceKeyResult.error.humanMessage,
			fix: spaceKeyResult.error.humanMessage,
		});
	} else {
		const target = createTargetFn(creds, spaceKeyResult.value);
		const searchResult = await target.searchPages(
			`type=page and space=${spaceKeyResult.value}`,
		);
		if (!searchResult.ok) {
			const isUnreachable = searchResult.error.kind === "RemoteUnreachable";
			const isForbidden = searchResult.error.kind === "Auth";
			checks.push({
				check: DOCTOR_CHECK_IDS.SPACE_ACCESS,
				status: "fail",
				detail: isUnreachable
					? "Base URL unreachable"
					: isForbidden
						? `Space ${spaceKeyResult.value} not accessible (403 forbidden)`
						: `Space access failed: ${searchResult.error.kind}`,
				fix: isUnreachable
					? "Check MARKSYNC_CONFLUENCE_BASE_URL and network connectivity"
					: isForbidden
						? `Verify spaceKey "${spaceKeyResult.value}" and account permissions`
						: "Check space access configuration",
			});
		} else {
			checks.push({
				check: DOCTOR_CHECK_IDS.SPACE_ACCESS,
				status: "pass",
				detail: `Space ${spaceKeyResult.value} is accessible`,
			});
		}
	}

	// --- Check 5: parent-page ---
	const parentPageIdResult = extractParentPageId(config);
	const parentPageId = parentPageIdResult.ok ? parentPageIdResult.value : null;
	if (!parentPageIdResult.ok) {
		checks.push({
			check: DOCTOR_CHECK_IDS.PARENT_PAGE,
			status: "fail",
			detail: parentPageIdResult.error.humanMessage,
			fix: parentPageIdResult.error.humanMessage,
		});
	} else if (spaceKey) {
		const target = createTargetFn(creds, spaceKey);
		const pageResult = await target.getPage(parentPageIdResult.value);
		if (!pageResult.ok) {
			const isNotFound = pageResult.error.kind === "RemoteMissing";
			const isForbidden = pageResult.error.kind === "Auth";
			checks.push({
				check: DOCTOR_CHECK_IDS.PARENT_PAGE,
				status: "fail",
				detail: isNotFound
					? `Parent page ${parentPageIdResult.value} not found (404)`
					: isForbidden
						? `Parent page ${parentPageIdResult.value} not writable (403 forbidden)`
						: `Parent page access failed: ${pageResult.error.kind}`,
				fix: isNotFound
					? `Verify parentPageId "${parentPageIdResult.value}" in marksync.yml`
					: isForbidden
						? `Check page permissions for ${parentPageIdResult.value}`
						: "Check parent page configuration",
			});
		} else {
			checks.push({
				check: DOCTOR_CHECK_IDS.PARENT_PAGE,
				status: "pass",
				detail: `Parent page ${parentPageIdResult.value} exists and is readable`,
			});
		}
	} else {
		// spaceKey not configured — space-access already failed; cannot construct a target.
		checks.push({
			check: DOCTOR_CHECK_IDS.PARENT_PAGE,
			status: "skipped",
			detail: "Skipped: spaceKey not configured",
		});
	}

	// --- Check 6 & 7: content-property and attachment (probe only) ---
	if (!probeCapabilities) {
		checks.push(
			{
				check: DOCTOR_CHECK_IDS.CONTENT_PROPERTY,
				status: "skipped",
				detail: "Skipped: --probe-capabilities flag not set",
			},
			{
				check: DOCTOR_CHECK_IDS.ATTACHMENT,
				status: "skipped",
				detail: "Skipped: --probe-capabilities flag not set",
			},
		);
	} else if (!spaceKey || !parentPageId) {
		// Cannot construct a target without both keys (space/parent already failed).
		checks.push(
			{
				check: DOCTOR_CHECK_IDS.CONTENT_PROPERTY,
				status: "skipped",
				detail: "Skipped: spaceKey or parentPageId not configured",
			},
			{
				check: DOCTOR_CHECK_IDS.ATTACHMENT,
				status: "skipped",
				detail: "Skipped: spaceKey or parentPageId not configured",
			},
		);
	} else {
		// Self-cleaning capability probe (AC-F3-2): create a scratch page, probe, then
		// delete. The delete is in `finally` so the page is always cleaned up; a delete
		// failure is advisory (warn note) and never overwrites the probe results or
		// gates the exit (RSK-2).
		const target = createTargetFn(creds, spaceKey);
		const scratchTitle = `marksync-doctor-probe-${Date.now()}`;
		let scratchPageId: string | null = null;
		let createFailedKind: string | null = null;
		let probed = false;
		let contentStatus: DoctorStatus = "skipped";
		let contentDetail = "";
		let contentFix: string | undefined;
		let attachStatus: DoctorStatus = "skipped";
		let attachDetail = "";
		let attachFix: string | undefined;

		try {
			const createResult = await target.createPage({
				parentId: parentPageId,
				title: scratchTitle,
				body: "marksync doctor probe — safe to delete",
				message: "marksync doctor capability probe",
			});
			if (!createResult.ok) {
				createFailedKind = createResult.error.kind;
			} else {
				scratchPageId = createResult.value.id;
				const putPropertyResult = await target.putProperty(
					scratchPageId,
					"marksync.metadata",
					'{"probe":true}',
				);
				if (putPropertyResult.ok) {
					contentStatus = "pass";
					contentDetail = "Content property API is writable";
				} else {
					contentStatus = "fail";
					contentDetail = `Failed to write test property: ${putPropertyResult.error.kind}`;
					contentFix = "Check content property API permissions";
				}

				const attachResult = await target.attachmentExists(
					scratchPageId,
					"test.png",
				);
				if (attachResult.ok) {
					attachStatus = "pass";
					attachDetail = "Attachment endpoint is reachable";
				} else {
					attachStatus = "fail";
					attachDetail = `Attachment endpoint probe failed: ${attachResult.error.kind}`;
					attachFix = "Check attachment API permissions";
				}
				probed = true;
			}
		} finally {
			// Self-clean: always attempt to delete the scratch page if it was created.
			// A failure surfaces as an advisory note on the content-property detail; it
			// never changes the probe pass/fail outcome (RSK-2).
			let cleanupNote = "";
			if (scratchPageId) {
				const deleteResult = await target.deletePage(scratchPageId);
				if (!deleteResult.ok) {
					cleanupNote =
						" (warn: scratch page cleanup failed — page left behind)";
				}
			}

			if (createFailedKind !== null) {
				checks.push(
					{
						check: DOCTOR_CHECK_IDS.CONTENT_PROPERTY,
						status: "fail",
						detail: `Failed to create scratch page: ${createFailedKind}`,
						fix: "Check write permissions on the parent page subtree",
					},
					{
						check: DOCTOR_CHECK_IDS.ATTACHMENT,
						status: "skipped",
						detail: "Skipped: scratch page creation failed",
					},
				);
			} else if (!probed) {
				checks.push(
					{
						check: DOCTOR_CHECK_IDS.CONTENT_PROPERTY,
						status: "fail",
						detail: "Capability probe did not complete",
						fix: "Re-run with --probe-capabilities",
					},
					{
						check: DOCTOR_CHECK_IDS.ATTACHMENT,
						status: "skipped",
						detail: "Skipped: capability probe did not complete",
					},
				);
			} else {
				checks.push(
					{
						check: DOCTOR_CHECK_IDS.CONTENT_PROPERTY,
						status: contentStatus,
						detail: contentDetail + cleanupNote,
						...(contentFix !== undefined ? { fix: contentFix } : {}),
					},
					{
						check: DOCTOR_CHECK_IDS.ATTACHMENT,
						status: attachStatus,
						detail: attachDetail,
						...(attachFix !== undefined ? { fix: attachFix } : {}),
					},
				);
			}
		}
	}

	// --- Check 8: permission-visibility (warn-only) ---
	if (spaceKey && parentPageId) {
		const target = createTargetFn(creds, spaceKey);
		const restrictionsResult = await target.getRestrictions(parentPageId);
		if (restrictionsResult.ok && restrictionsResult.value) {
			checks.push({
				check: DOCTOR_CHECK_IDS.PERMISSION_VISIBILITY,
				status: "warn",
				detail:
					"Restrictions detected on parent page — assuming full read access to the configured subtree; a 403 will be treated as warn+skip, not delete (R-FEA-10)",
			});
		} else {
			checks.push({
				check: DOCTOR_CHECK_IDS.PERMISSION_VISIBILITY,
				status: "warn",
				detail:
					"Assuming full read access to the configured subtree; a 403 will be treated as warn+skip, not delete (R-FEA-10)",
			});
		}
	} else {
		checks.push({
			check: DOCTOR_CHECK_IDS.PERMISSION_VISIBILITY,
			status: "warn",
			detail:
				"Assuming full read access to the configured subtree; a 403 will be treated as warn+skip, not delete (R-FEA-10)",
		});
	}

	// --- Check 9: renderer (warn-only, informational) ---
	checks.push({
		check: DOCTOR_CHECK_IDS.RENDERER,
		status: "pass",
		detail:
			"Renderer availability informational (MS-0002 uses Kroki remote rendering; check not yet implemented)",
	});

	return Res.ok({
		checks,
		summary: computeSummary(checks),
		worstStatus: deriveWorstStatus(checks),
		probeCapabilities,
	});
}
