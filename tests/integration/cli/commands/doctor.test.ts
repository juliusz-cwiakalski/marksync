// Doctor command integration tests (GH-30 / TDR-0009 / DEC-4).
// Uses Bun.serve() mock Confluence server for end-to-end testing.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DoctorReport } from "#app/doctor";
import { runCli } from "#cli/index";
import type { CommandResult } from "#cli/output";

/** Create a fresh temp directory per test. */
function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "marksync-doctor-integration-"));
}

class CaptureStream {
	readonly chunks: string[] = [];
	write(chunk: string): boolean {
		this.chunks.push(chunk);
		return true;
	}
	joined(): string {
		return this.chunks.join("");
	}
}

function newStreams(): {
	stdout: CaptureStream;
	stderr: CaptureStream;
	stdout_w: { write: (c: string) => void };
	stderr_w: { write: (c: string) => void };
} {
	const stdout = new CaptureStream();
	const stderr = new CaptureStream();
	return {
		stdout,
		stderr,
		stdout_w: { write: (c: string) => void stdout.write(c) },
		stderr_w: { write: (c: string) => void stderr.write(c) },
	};
}

describe("TC-DOCTOR-013..022: Doctor integration tests (Bun.serve() mock)", () => {
	let dir: string;
	let origCwd: string;
	let server: ReturnType<typeof Bun.serve> | null = null;
	let mockRequests: Array<{ method: string; url: string; body?: string }> = [];

	beforeEach(() => {
		dir = tempDir();
		origCwd = process.cwd();
		mockRequests = [];
	});

	afterEach(() => {
		server?.stop();
		rmSync(dir, { recursive: true, force: true });
	});

	// TC-DOCTOR-013: Healthy pre-flight (default, read-only)
	test("TC-DOCTOR-013: Healthy pre-flight — all pass/warn, exit 0", async () => {
		// Setup mock server
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const url = new URL(req.url);
				mockRequests.push({ method: req.method, url: url.pathname });

				// GET /wiki/api/v2/user/by-me → auth check
				if (url.pathname === "/wiki/api/v2/user/by-me") {
					return new Response(
						JSON.stringify({
							accountId: "5e1c8b9e-5a1d-4e8c-9a2b-3c4d5e6f7a8b",
							accountType: "atlassian",
							email: "test@example.com",
							displayName: "Test User",
							accountStatus: "active",
							avatarUrl: null,
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				// GET /wiki/rest/api/content/{id} → parent page read
				const pageMatch = url.pathname.match(
					/^\/wiki\/rest\/api\/content\/([^/]+)$/,
				);
				if (pageMatch) {
					return new Response(
						JSON.stringify({
							id: pageMatch[1],
							type: "page",
							status: "current",
							title: "Parent Page",
							version: { number: 1 },
							body: {
								view: { value: "Page content", representation: "view" },
								export_view: {
									value: "Page content",
									representation: "export_view",
								},
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				// CQL search for space access
				if (url.pathname === "/wiki/rest/api/search") {
					return new Response(
						JSON.stringify({
							start: 0,
							limit: 10,
							size: 0,
							results: [],
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				// GET /wiki/rest/api/content/{id}/restriction → restrictions
				const restrictionMatch = url.pathname.match(
					/^\/wiki\/rest\/api\/content\/([^/]+)\/restriction$/,
				);
				if (restrictionMatch) {
					return new Response(
						JSON.stringify({
							start: 0,
							limit: 25,
							size: 0,
							results: [],
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		// Setup config
		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: TESTSPACE
    parentPageId: 123
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");

		// Set env vars
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = `http://localhost:${server.port}`;
		process.env.MARKSYNC_USER_EMAIL = "test@example.com";
		process.env.MARKSYNC_API_TOKEN = "test-token-123";

		// Run doctor
		const s = newStreams();
		const exit = await runCli(["doctor"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		expect(exit).toBe(0);

		// Verify writes occurred (should be 0 for read-only)
		const writes = mockRequests.filter((r) =>
			["POST", "PUT", "DELETE"].includes(r.method),
		);
		expect(writes.length).toBe(0);
	});

	// TC-DOCTOR-014: --json envelope validity
	test("TC-DOCTOR-014: --json emits valid CommandResult<DoctorReport>", async () => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const url = new URL(req.url);
				mockRequests.push({ method: req.method, url: url.pathname });

				if (url.pathname === "/wiki/api/v2/user/by-me") {
					return new Response(
						JSON.stringify({
							accountId: "5e1c8b9e-5a1d-4e8c-9a2b-3c4d5e6f7a8b",
							accountType: "atlassian",
							email: "test@example.com",
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url.pathname.match(/^\/wiki\/rest\/api\/content\/[^/]+$/)) {
					return new Response(
						JSON.stringify({
							id: "123",
							type: "page",
							status: "current",
							title: "Parent Page",
							version: { number: 1 },
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url.pathname === "/wiki/rest/api/search") {
					return new Response(
						JSON.stringify({ start: 0, limit: 10, size: 0, results: [] }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url.pathname.match(/\/restriction$/)) {
					return new Response(
						JSON.stringify({ start: 0, limit: 25, size: 0, results: [] }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: TESTSPACE
    parentPageId: 123
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = `http://localhost:${server.port}`;
		process.env.MARKSYNC_USER_EMAIL = "test@example.com";
		process.env.MARKSYNC_API_TOKEN = "test-token-123";

		const s = newStreams();
		await runCli(["doctor", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		const output = s.stdout.joined();
		expect(() => JSON.parse(output)).not.toThrow();

		const parsed = JSON.parse(output) as CommandResult<DoctorReport>;
		expect(parsed.schemaVersion).toBe(1);
		expect(typeof parsed.runId).toBe("string");
		expect(typeof parsed.exit_code).toBe("number");
		expect(parsed.data).toBeDefined();
		expect(parsed.error).toBeUndefined();

		// Verify DoctorReport structure
		const report = parsed.data;
		expect(report.checks).toBeInstanceOf(Array);
		expect(report.summary).toBeDefined();
		expect(report.worstStatus).toMatch(/^(pass|warn|fail)$/);
		expect(typeof report.probeCapabilities).toBe("boolean");
	});

	// TC-DOCTOR-015: Redaction assertion
	test("TC-DOCTOR-015: Redaction scrubs token-shaped substrings from output", async () => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const url = new URL(req.url);
				mockRequests.push({ method: req.method, url: url.pathname });

				if (url.pathname === "/wiki/api/v2/user/by-me") {
					// Return error body with token-shaped substring
					return new Response(
						JSON.stringify({
							message: "Invalid token: ATATTAaB3cD4eF5gH6iJ7kL8mN9oP0qR1",
						}),
						{ status: 401, headers: { "Content-Type": "application/json" } },
					);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: TESTSPACE
    parentPageId: 123
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = `http://localhost:${server.port}`;
		process.env.MARKSYNC_USER_EMAIL = "test@example.com";
		process.env.MARKSYNC_API_TOKEN = "ATATTAaB3cD4eF5gH6iJ7kL8mN9oP0qR1";

		const s = newStreams();
		await runCli(["doctor", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		const output = s.stdout.joined();

		// Assert token-shaped substrings are redacted
		expect(output).not.toContain("ATATTAaB3cD4eF5gH6iJ7kL8mN9oP0qR1");
		expect(output).toContain("[REDACTED:");

		// Assert non-sensitive context is preserved
		expect(output).toContain("Invalid token:");
	});

	// TC-DOCTOR-016: Bad token → credentials fail, exit 60
	test("TC-DOCTOR-016: Bad token → credentials fail, no token leak, exit 60", async () => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const url = new URL(req.url);
				mockRequests.push({ method: req.method, url: url.pathname });

				if (url.pathname === "/wiki/api/v2/user/by-me") {
					return new Response(JSON.stringify({ message: "Unauthorized" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					});
				}

				return new Response("Not found", { status: 404 });
			},
		});

		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: TESTSPACE
    parentPageId: 123
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = `http://localhost:${server.port}`;
		process.env.MARKSYNC_USER_EMAIL = "test@example.com";
		process.env.MARKSYNC_API_TOKEN = "bad-token";

		const s = newStreams();
		const exit = await runCli(["doctor", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		expect(exit).toBe(60);

		const output = s.stdout.joined();
		expect(() => JSON.parse(output)).not.toThrow();

		const parsed = JSON.parse(output) as CommandResult<DoctorReport>;
		expect(parsed.error).toBeUndefined(); // Data always present
		expect(parsed.data).toBeDefined();

		// Assert raw token is not leaked
		expect(output).not.toContain("bad-token");

		// Verify credentials check reports fail
		const credsCheck = parsed.data.checks.find(
			(c: { check: string }) => c.check === "credentials",
		);
		expect(credsCheck?.status).toBe("fail");
	});

	// TC-DOCTOR-017: Wrong/inaccessible space → space-access fail, exit 60
	test("TC-DOCTOR-017: Wrong spaceKey → space-access fail, exit 60", async () => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const url = new URL(req.url);
				mockRequests.push({ method: req.method, url: url.pathname });

				if (url.pathname === "/wiki/api/v2/user/by-me") {
					return new Response(
						JSON.stringify({
							accountId: "5e1c8b9e-5a1d-4e8c-9a2b-3c4d5e6f7a8b",
							email: "test@example.com",
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url.pathname === "/wiki/rest/api/search") {
					return new Response(
						JSON.stringify({ start: 0, limit: 10, size: 0, results: [] }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: WRONGSPACE
    parentPageId: 123
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = `http://localhost:${server.port}`;
		process.env.MARKSYNC_USER_EMAIL = "test@example.com";
		process.env.MARKSYNC_API_TOKEN = "test-token-123";

		const s = newStreams();
		const exit = await runCli(["doctor", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		expect(exit).toBe(60);

		const output = s.stdout.joined();
		const parsed = JSON.parse(output) as CommandResult<DoctorReport>;

		// Verify space-access check reports fail
		const spaceCheck = parsed.data.checks.find(
			(c: { check: string }) => c.check === "space-access",
		);
		expect(spaceCheck?.status).toBe("fail");
	});

	// TC-DOCTOR-018: Missing parent → parent-page fail, exit 60
	test("TC-DOCTOR-018: Missing parent → parent-page fail, exit 60", async () => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const url = new URL(req.url);
				mockRequests.push({ method: req.method, url: url.pathname });

				if (url.pathname === "/wiki/api/v2/user/by-me") {
					return new Response(
						JSON.stringify({
							accountId: "5e1c8b9e-5a1d-4e8c-9a2b-3c4d5e6f7a8b",
							email: "test@example.com",
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url.pathname === "/wiki/rest/api/search") {
					return new Response(
						JSON.stringify({ start: 0, limit: 10, size: 0, results: [] }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				// GET /wiki/rest/api/content/{id} → 404 for missing parent
				if (url.pathname.match(/^\/wiki\/rest\/api\/content\/[^/]+$/)) {
					return new Response("Not found", { status: 404 });
				}

				return new Response("Not found", { status: 404 });
			},
		});

		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: TESTSPACE
    parentPageId: 999
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = `http://localhost:${server.port}`;
		process.env.MARKSYNC_USER_EMAIL = "test@example.com";
		process.env.MARKSYNC_API_TOKEN = "test-token-123";

		const s = newStreams();
		const exit = await runCli(["doctor", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		expect(exit).toBe(60);

		const output = s.stdout.joined();
		const parsed = JSON.parse(output) as CommandResult<DoctorReport>;

		// Verify parent-page check reports fail
		const parentCheck = parsed.data.checks.find(
			(c: { check: string }) => c.check === "parent-page",
		);
		expect(parentCheck?.status).toBe("fail");
	});

	// TC-DOCTOR-019: --probe-capabilities self-cleaning
	test("TC-DOCTOR-019: --probe-capabilities — self-cleaning scratch page", async () => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const url = new URL(req.url);
				mockRequests.push({
					method: req.method,
					url: url.pathname,
					body: await req.text(),
				});

				if (url.pathname === "/wiki/api/v2/user/by-me") {
					return new Response(
						JSON.stringify({ accountId: "acc", email: "test@example.com" }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url.pathname === "/wiki/rest/api/search") {
					return new Response(
						JSON.stringify({ start: 0, limit: 10, size: 0, results: [] }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				const pageMatch = url.pathname.match(
					/^\/wiki\/rest\/api\/content\/([^/]+)$/,
				);
				if (pageMatch) {
					// GET existing page
					if (req.method === "GET") {
						return new Response(
							JSON.stringify({
								id: pageMatch[1],
								type: "page",
								status: "current",
							}),
							{ status: 200, headers: { "Content-Type": "application/json" } },
						);
					}

					// DELETE scratch page
					if (req.method === "DELETE") {
						return new Response(null, { status: 204 });
					}
				}

				// POST /wiki/rest/api/content → create scratch page
				if (
					url.pathname === "/wiki/rest/api/content" &&
					req.method === "POST"
				) {
					const body = JSON.parse(await req.text());
					return new Response(
						JSON.stringify({ id: "scratch-123", type: "page" }),
						{ status: 201, headers: { "Content-Type": "application/json" } },
					);
				}

				// PUT property
				if (url.pathname.match(/\/property$/) && req.method === "PUT") {
					return new Response(null, { status: 200 });
				}

				// GET attachment
				if (url.pathname.match(/\/attachment$/) && req.method === "GET") {
					return new Response(JSON.stringify({ results: [] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}

				// GET restrictions
				if (url.pathname.match(/\/restriction$/) && req.method === "GET") {
					return new Response(
						JSON.stringify({ start: 0, limit: 25, size: 0, results: [] }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: TESTSPACE
    parentPageId: 123
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = `http://localhost:${server.port}`;
		process.env.MARKSYNC_USER_EMAIL = "test@example.com";
		process.env.MARKSYNC_API_TOKEN = "test-token-123";

		const s = newStreams();
		const exit = await runCli(["doctor", "--probe-capabilities"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		// Should succeed (all probes pass)
		expect(exit).toBe(0);

		// Verify scratch page was created and deleted
		const creates = mockRequests.filter((r) => r.method === "POST");
		const deletes = mockRequests.filter((r) => r.method === "DELETE");
		expect(creates.length).toBe(1);
		expect(deletes.length).toBe(1);

		const output = s.stdout.joined();
		const parsed = JSON.parse(output) as CommandResult<DoctorReport>;

		// Verify capability probes report pass
		const propCheck = parsed.data.checks.find(
			(c: { check: string }) => c.check === "content-property",
		);
		const attachCheck = parsed.data.checks.find(
			(c: { check: string }) => c.check === "attachment",
		);
		expect(propCheck?.status).toBe("pass");
		expect(attachCheck?.status).toBe("pass");
	});

	// TC-DOCTOR-020: Permission advisory
	test("TC-DOCTOR-020: Permission/visibility check emits warn, does not gate exit", async () => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const url = new URL(req.url);
				mockRequests.push({ method: req.method, url: url.pathname });

				if (url.pathname === "/wiki/api/v2/user/by-me") {
					return new Response(
						JSON.stringify({ accountId: "acc", email: "test@example.com" }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				const pageMatch = url.pathname.match(
					/^\/wiki\/rest\/api\/content\/([^/]+)$/,
				);
				if (pageMatch) {
					return new Response(
						JSON.stringify({ id: pageMatch[1], type: "page" }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url.pathname === "/wiki/rest/api/search") {
					return new Response(
						JSON.stringify({ start: 0, limit: 10, size: 0, results: [] }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				// GET restrictions — return some to trigger warn
				if (url.pathname.match(/\/restriction$/)) {
					return new Response(
						JSON.stringify({
							start: 0,
							limit: 25,
							size: 1,
							results: [{ operation: "read", restrictions: [] }],
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				return new Response("Not found", { status: 404 });
			},
		});

		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: TESTSPACE
    parentPageId: 123
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = `http://localhost:${server.port}`;
		process.env.MARKSYNC_USER_EMAIL = "test@example.com";
		process.env.MARKSYNC_API_TOKEN = "test-token-123";

		const s = newStreams();
		const exit = await runCli(["doctor", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		// Warn does not gate exit
		expect(exit).toBe(0);

		const output = s.stdout.joined();
		const parsed = JSON.parse(output) as CommandResult<DoctorReport>;

		// Verify permission-visibility check emits warn
		const permCheck = parsed.data.checks.find(
			(c: { check: string }) => c.check === "permission-visibility",
		);
		expect(permCheck?.status).toBe("warn");
		expect(permCheck?.detail).toContain("403");
	});

	// TC-DOCTOR-022: Any gating fail → exit 60, data present, error unset
	test("TC-DOCTOR-022.1: Git fail → exit 60, data present, error unset", async () => {
		// No server needed for git-only failure
		const mockConfig = `
targets:
  default:
    type: confluence
    spaceKey: TESTSPACE
    parentPageId: 123
`;
		writeFileSync(join(dir, "marksync.yml"), mockConfig, "utf-8");

		// Don't set env vars - credentials will fail but config should still load

		const s = newStreams();
		const exit = await runCli(["doctor", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});

		// Should fail due to missing credentials
		expect(exit).toBe(60);

		const output = s.stdout.joined();
		expect(() => JSON.parse(output)).not.toThrow();

		const parsed = JSON.parse(output) as CommandResult<DoctorReport>;
		expect(parsed.data).toBeDefined();
		expect(parsed.error).toBeUndefined();
		expect(parsed.data.worstStatus).toBe("fail");
	});
});
