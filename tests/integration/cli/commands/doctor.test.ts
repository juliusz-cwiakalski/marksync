// Doctor command integration tests (GH-30 / TDR-0009 / DEC-4).
//
// Exercises the REAL validateCredentials + createTarget + loadConfig +
// createRepository against a Bun.serve() mock Confluence server. Credentials
// RESOLUTION is injected (credsFor) to bypass resolveCredentials' https check
// (the mock speaks http on localhost) — mirroring tests/integration/credentials.test.ts.
// Validation, target ops, config, and git stay REAL so the mock is genuinely hit.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DoctorReport } from "#app/doctor";
import { runDoctor } from "#app/doctor";
import { Result as Res } from "#domain/result";
import {
	codeToExitCode,
	EXIT_OK,
	renderJson,
	SCHEMA_VERSION,
	type CommandResult,
} from "#cli/output";

const TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";
const EMAIL = "juliusz@cwiakalski.com";
const MASKED_EMAIL = "j***@cwiakalski.com";

/** Build credentials pointing at a mock origin — bypasses resolveCredentials'
 *  https check (mirror of credsFor in tests/integration/credentials.test.ts;
 *  the mock speaks http). */
function credsFor(baseUrl: string) {
	const authHeader = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
	return {
		baseUrl,
		authHeader,
		email: MASKED_EMAIL,
		mode: "api-token" as const,
	};
}

/** Create a temp dir that is ALSO a valid git repo (so git-available passes). */
function makeTempRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), "marksync-doctor-int-"));
	Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
	Bun.spawnSync(["git", "config", "user.email", "t@t.test"], { cwd: dir });
	Bun.spawnSync(["git", "config", "user.name", "Test"], { cwd: dir });
	Bun.spawnSync(["git", "commit", "-q", "--allow-empty", "-m", "init"], {
		cwd: dir,
	});
	return dir;
}

/** Minimal valid marksync.yml body for the default target. Values are quoted
 *  so YAML parses them as strings (the schema rejects a numeric parentPageId). */
function configYaml(spaceKey = "TESTSPACE", parentPageId = "123"): string {
	return `version: 1\nroot: .\ntargets:\n  default:\n    type: confluence\n    spaceKey: "${spaceKey}"\n    parentPageId: "${parentPageId}"\n`;
}

/** Build the CommandResult<DoctorReport> the way doctorCommand does (DEC-4). */
function buildCommandResult(report: DoctorReport): CommandResult<DoctorReport> {
	const isFail = report.worstStatus === "fail";
	return {
		schemaVersion: SCHEMA_VERSION,
		runId: "test-run-id",
		exitCode: isFail ? codeToExitCode("DOCTOR_FAIL") : EXIT_OK,
		data: report,
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

interface MockRequest {
	method: string;
	url: string;
}

describe("TC-DOCTOR-013..022: Doctor integration tests (Bun.serve() mock)", () => {
	let dir = "";
	let server: ReturnType<typeof Bun.serve> | null = null;
	const mockRequests: MockRequest[] = [];

	beforeEach(() => {
		dir = "";
		server = null;
		mockRequests.length = 0;
	});

	afterEach(() => {
		server?.stop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	function record(req: Request): MockRequest {
		const entry = { method: req.method, url: new URL(req.url).pathname };
		mockRequests.push(entry);
		return entry;
	}

	function findCheck(report: DoctorReport, checkId: string) {
		return report.checks.find((c) => c.check === checkId);
	}

	// TC-DOCTOR-013: Healthy pre-flight (default, read-only)
	test("TC-DOCTOR-013: Healthy pre-flight — all pass/warn, exit 0", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				record(req);
				const path = new URL(req.url).pathname;
				if (path === "/wiki/api/v2/user/by-me")
					return jsonResponse(200, {
						accountId: "acc-1",
						displayName: "Test User",
					});
				if (path === "/wiki/rest/api/search")
					return jsonResponse(200, { results: [] });
				if (/^\/wiki\/api\/v2\/pages\/[^/]+$/.test(path))
					return jsonResponse(200, {
						id: "123",
						title: "Parent Page",
						version: { number: 1 },
					});
				if (/^\/wiki\/rest\/api\/content\/[^/]+\/restriction$/.test(path))
					return jsonResponse(200, { results: [] });
				return new Response("Not found", { status: 404 });
			},
		});

		dir = makeTempRepo();
		writeFileSync(join(dir, "marksync.yml"), configYaml(), "utf-8");
		const origin = `http://localhost:${server.port}`;

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: false,
			resolveCredentials: () => Res.ok(credsFor(origin)),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const report = result.value;

		// permission-visibility is always advisory warn, so a healthy run's
		// worstStatus is "warn" — what matters is no gating failure (exit 0).
		expect(report.worstStatus).not.toBe("fail");
		expect(findCheck(report, "credentials")?.status).toBe("pass");
		expect(findCheck(report, "space-access")?.status).toBe("pass");
		expect(findCheck(report, "parent-page")?.status).toBe("pass");

		// Read-only: no mutating requests crossed the wire.
		const writes = mockRequests.filter((r) =>
			["POST", "PUT", "DELETE"].includes(r.method),
		);
		expect(writes.length).toBe(0);
	});

	// TC-DOCTOR-014: --json envelope validity
	test("TC-DOCTOR-014: --json emits valid CommandResult<DoctorReport>", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				record(req);
				const path = new URL(req.url).pathname;
				if (path === "/wiki/api/v2/user/by-me")
					return jsonResponse(200, {
						accountId: "acc-1",
						displayName: "Test User",
					});
				if (path === "/wiki/rest/api/search")
					return jsonResponse(200, { results: [] });
				if (/^\/wiki\/api\/v2\/pages\/[^/]+$/.test(path))
					return jsonResponse(200, {
						id: "123",
						title: "Parent Page",
						version: { number: 1 },
					});
				if (/^\/wiki\/rest\/api\/content\/[^/]+\/restriction$/.test(path))
					return jsonResponse(200, { results: [] });
				return new Response("Not found", { status: 404 });
			},
		});

		dir = makeTempRepo();
		writeFileSync(join(dir, "marksync.yml"), configYaml(), "utf-8");
		const origin = `http://localhost:${server.port}`;

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: false,
			resolveCredentials: () => Res.ok(credsFor(origin)),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Render the envelope exactly as doctorCommand would (DEC-4 / DEC-2).
		const json = renderJson(buildCommandResult(result.value));
		expect(() => JSON.parse(json)).not.toThrow();
		const parsed = JSON.parse(json) as {
			schema_version: number;
			exit_code: number;
			run_id: string;
			data: {
				worst_status: string;
				probe_capabilities: boolean;
				checks: unknown[];
			};
		};
		// snake_case wire format (DEC-2).
		expect(parsed.schema_version).toBe(1);
		expect(typeof parsed.run_id).toBe("string");
		expect(parsed.exit_code).toBe(EXIT_OK);
		expect(parsed.data.worst_status).not.toBe("fail");
		expect(parsed.data.probe_capabilities).toBe(false);
		expect(parsed.data.checks).toBeInstanceOf(Array);
	});

	// TC-DOCTOR-015: Redaction — a token-shaped substring in a remote error
	// body never reaches the rendered report (INV-SEC-1).
	test("TC-DOCTOR-015: credentials rejection carries no token in the report", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				record(req);
				const path = new URL(req.url).pathname;
				if (path === "/wiki/api/v2/user/by-me")
					return jsonResponse(401, { message: `Invalid token: ${TOKEN}` });
				return new Response("Not found", { status: 404 });
			},
		});

		dir = makeTempRepo();
		writeFileSync(join(dir, "marksync.yml"), configYaml(), "utf-8");
		const origin = `http://localhost:${server.port}`;

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: false,
			resolveCredentials: () => Res.ok(credsFor(origin)),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const report = result.value;

		expect(findCheck(report, "credentials")?.status).toBe("fail");
		// Doctor detail fields are fixed human strings — the raw error body (and
		// thus the token) never enters the report, so the serialized envelope
		// carries no token-shaped substring.
		const output = renderJson(buildCommandResult(report));
		expect(output).not.toContain(TOKEN);
		expect(output).not.toContain("test-token");
	});

	// TC-DOCTOR-016: Bad token → credentials fail, no token leak
	test("TC-DOCTOR-016: Bad token → credentials fail, no token leak", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				record(req);
				const path = new URL(req.url).pathname;
				if (path === "/wiki/api/v2/user/by-me")
					return jsonResponse(401, { message: "Unauthorized" });
				return new Response("Not found", { status: 404 });
			},
		});

		dir = makeTempRepo();
		writeFileSync(join(dir, "marksync.yml"), configYaml(), "utf-8");
		const origin = `http://localhost:${server.port}`;

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: false,
			resolveCredentials: () => Res.ok(credsFor(origin)),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const report = result.value;

		expect(report.worstStatus).toBe("fail");
		expect(findCheck(report, "credentials")?.status).toBe("fail");
		expect(renderJson(buildCommandResult(report))).not.toContain(TOKEN);
	});

	// TC-DOCTOR-017: Wrong/inaccessible space → space-access fail
	test("TC-DOCTOR-017: Wrong spaceKey → space-access fail", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				record(req);
				const path = new URL(req.url).pathname;
				if (path === "/wiki/api/v2/user/by-me")
					return jsonResponse(200, {
						accountId: "acc-1",
						displayName: "Test User",
					});
				if (path === "/wiki/rest/api/search")
					return jsonResponse(403, { message: "forbidden" });
				return new Response("Not found", { status: 404 });
			},
		});

		dir = makeTempRepo();
		writeFileSync(join(dir, "marksync.yml"), configYaml("WRONGSPACE"), "utf-8");
		const origin = `http://localhost:${server.port}`;

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: false,
			resolveCredentials: () => Res.ok(credsFor(origin)),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const report = result.value;

		expect(report.worstStatus).toBe("fail");
		expect(findCheck(report, "space-access")?.status).toBe("fail");
	});

	// TC-DOCTOR-018: Missing parent → parent-page fail
	test("TC-DOCTOR-018: Missing parent → parent-page fail", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				record(req);
				const path = new URL(req.url).pathname;
				if (path === "/wiki/api/v2/user/by-me")
					return jsonResponse(200, {
						accountId: "acc-1",
						displayName: "Test User",
					});
				if (path === "/wiki/rest/api/search")
					return jsonResponse(200, { results: [] });
				if (/^\/wiki\/api\/v2\/pages\/[^/]+$/.test(path))
					return new Response("Not found", { status: 404 });
				return new Response("Not found", { status: 404 });
			},
		});

		dir = makeTempRepo();
		writeFileSync(
			join(dir, "marksync.yml"),
			configYaml("TESTSPACE", "999"),
			"utf-8",
		);
		const origin = `http://localhost:${server.port}`;

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: false,
			resolveCredentials: () => Res.ok(credsFor(origin)),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const report = result.value;

		expect(report.worstStatus).toBe("fail");
		expect(findCheck(report, "parent-page")?.status).toBe("fail");
	});

	// TC-DOCTOR-019: --probe-capabilities self-cleaning scratch page
	test("TC-DOCTOR-019: --probe-capabilities — self-cleaning scratch page", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				record(req);
				const path = new URL(req.url).pathname;
				if (path === "/wiki/api/v2/user/by-me")
					return jsonResponse(200, {
						accountId: "acc-1",
						displayName: "Test User",
					});
				if (path === "/wiki/rest/api/search")
					return jsonResponse(200, { results: [] });
				// parent page read (v2 GET)
				if (
					/^\/wiki\/api\/v2\/pages\/[^/]+$/.test(path) &&
					req.method === "GET"
				)
					return jsonResponse(200, {
						id: "123",
						title: "Parent Page",
						version: { number: 1 },
					});
				// scratch page create (v2 POST)
				if (path === "/wiki/api/v2/pages" && req.method === "POST")
					return jsonResponse(201, {
						id: "scratch-1",
						title: "probe",
						version: { number: 1 },
					});
				// content property write (v1 POST/PUT)
				if (
					/\/property$/.test(path) &&
					(req.method === "POST" || req.method === "PUT")
				)
					return jsonResponse(200, {});
				// attachment list probe (v1 GET)
				if (/\/child\/attachment$/.test(path) && req.method === "GET")
					return jsonResponse(200, { results: [] });
				// scratch page delete (v1 DELETE) — hit by the injected cleanup
				if (
					/^\/wiki\/rest\/api\/content\/[^/]+$/.test(path) &&
					req.method === "DELETE"
				)
					return new Response(null, { status: 204 });
				// restrictions read (v1 GET)
				if (/^\/wiki\/rest\/api\/content\/[^/]+\/restriction$/.test(path))
					return jsonResponse(200, { results: [] });
				return new Response("Not found", { status: 404 });
			},
		});

		dir = makeTempRepo();
		writeFileSync(join(dir, "marksync.yml"), configYaml(), "utf-8");
		const origin = `http://localhost:${server.port}`;

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: true,
			resolveCredentials: () => Res.ok(credsFor(origin)),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const report = result.value;

		expect(findCheck(report, "content-property")?.status).toBe("pass");
		expect(findCheck(report, "attachment")?.status).toBe("pass");
		expect(report.worstStatus).not.toBe("fail");

		// Scratch page was created (v2 POST) and self-cleaned (DELETE).
		expect(
			mockRequests.filter(
				(r) => r.method === "POST" && r.url === "/wiki/api/v2/pages",
			).length,
		).toBe(1);
		expect(mockRequests.filter((r) => r.method === "DELETE").length).toBe(1);
	});

	// TC-DOCTOR-020: Permission advisory — warn never gates exit
	test("TC-DOCTOR-020: Permission/visibility check emits warn, does not gate exit", async () => {
		server = Bun.serve({
			port: 0,
			fetch(req) {
				record(req);
				const path = new URL(req.url).pathname;
				if (path === "/wiki/api/v2/user/by-me")
					return jsonResponse(200, {
						accountId: "acc-1",
						displayName: "Test User",
					});
				if (path === "/wiki/rest/api/search")
					return jsonResponse(200, { results: [] });
				if (/^\/wiki\/api\/v2\/pages\/[^/]+$/.test(path))
					return jsonResponse(200, {
						id: "123",
						title: "Parent Page",
						version: { number: 1 },
					});
				// restrictions present → permission-visibility advisory
				if (/^\/wiki\/rest\/api\/content\/[^/]+\/restriction$/.test(path))
					return jsonResponse(200, {
						results: [{ operation: "read", restrictions: { user: ["u1"] } }],
					});
				return new Response("Not found", { status: 404 });
			},
		});

		dir = makeTempRepo();
		writeFileSync(join(dir, "marksync.yml"), configYaml(), "utf-8");
		const origin = `http://localhost:${server.port}`;

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: false,
			resolveCredentials: () => Res.ok(credsFor(origin)),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const report = result.value;

		expect(findCheck(report, "permission-visibility")?.status).toBe("warn");
		// Warn does not gate exit.
		expect(report.worstStatus).not.toBe("fail");
	});

	// TC-DOCTOR-022: Any gating fail → worstStatus fail, report present
	test("TC-DOCTOR-022.1: Git fail → worstStatus fail, report present", async () => {
		// Inject a Repository whose headSha() fails. shell-git's spawnGit THROWS
		// on a non-git dir and the temp dir's relation to a worktree is
		// environment-dependent, so inject deterministically instead (DEC-4).
		dir = mkdtempSync(join(tmpdir(), "marksync-doctor-int-"));
		writeFileSync(join(dir, "marksync.yml"), configYaml(), "utf-8");

		const result = await runDoctor({
			cwd: dir,
			probeCapabilities: false,
			resolveCredentials: () =>
				Res.err({
					kind: "Auth",
					authKind: "MissingCredentials",
					missing: [
						"MARKSYNC_USER_EMAIL",
						"MARKSYNC_API_TOKEN",
						"MARKSYNC_CONFLUENCE_BASE_URL",
					],
				}),
			createRepository: () => ({
				headSha: () =>
					Res.err({
						kind: "RemoteUnreachable",
						cause: "not a git repository",
					}),
				currentBranch: () =>
					Res.err({
						kind: "RemoteUnreachable",
						cause: "not a git repository",
					}),
				readCommitted: () => Res.ok(new Map()),
				listCommitSubjects: () => Res.ok([]),
			}),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const report = result.value;

		expect(report.worstStatus).toBe("fail");
		expect(findCheck(report, "git-available")?.status).toBe("fail");
	});
});
