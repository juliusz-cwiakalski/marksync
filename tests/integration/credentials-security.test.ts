// tests/integration/credentials-security.test.ts
//
// INV-SEC-1 security integration test for the credential provider (GH-17 D-8 /
// AC-4 / AC-5 / RSK-1 / RSK-3 / TC-SEC-001..003). RELEASE-BLOCKING: if this
// fails, the change does not ship.
//
// Captures every string the provider can yield across the happy path AND every
// error path — the Result value/error serialized, the {code,message,retryable}
// produced by mapping each AuthError, and the real bytes emitted by
// OutputService.emit (redact→render→write) — then asserts the raw token
// substring appears in NONE of them, and the email is masked wherever surfaced.
//
// The fake token `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9` matches the `atlassian-
// token` redactor pattern, so TC-SEC-003 (the defense-in-depth redactor check)
// is meaningful: the redactor WOULD catch it, but the provider must never emit
// it in the first place.

import { beforeAll, describe, expect, test } from "bun:test";
import { mapMarkSyncErrorToCommandError } from "#app/cli-error-map";
import { resolveCredentials, validateCredentials } from "#app/credentials";
import type { AuthError } from "#domain/errors";
import type { ConfluenceCredentials } from "#domain/credentials";
import {
	OutputService,
	err,
	redactString,
	type WritableLike,
} from "#cli/output";

const TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";
const EMAIL = "juliusz@cwiakalski.com";
const MASKED_EMAIL = "j***@cwiakalski.com";
const BASE_URL = "https://example.atlassian.net";

const ENV_BASE_URL = "MARKSYNC_CONFLUENCE_BASE_URL";
const ENV_EMAIL = "MARKSYNC_USER_EMAIL";
const ENV_API_TOKEN = "MARKSYNC_API_TOKEN";
const ENV_KEYS = [ENV_BASE_URL, ENV_EMAIL, ENV_API_TOKEN] as const;

/** An in-memory writable that records every chunk written to it. */
class CaptureStream implements WritableLike {
	readonly chunks: string[] = [];
	write(chunk: string): void {
		this.chunks.push(chunk);
	}
	get text(): string {
		return this.chunks.join("");
	}
}

function credsFor(baseUrl = BASE_URL): ConfluenceCredentials {
	const authHeader = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
	return { baseUrl, authHeader, email: MASKED_EMAIL, mode: "api-token" };
}

/** A Bun.serve mock whose handler picks a response by request count. */
function serveMock(respond: (count: number) => Response): {
	origin: string;
	stop: () => void;
} {
	let count = 0;
	const server = Bun.serve({
		port: 0,
		fetch: () => {
			count += 1;
			return respond(count);
		},
	});
	return {
		origin: `http://localhost:${server.port}`,
		stop: () => server.stop(true),
	};
}

function jsonBody(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Capture every provider-produced string for one path: the serialized Result
 * value/error, plus the mapped {code,message,retryable} (JSON + message) when
 * the result is an AuthError.
 */
function captureResult(
	captured: string[],
	result:
		| { ok: true; value: ConfluenceCredentials }
		| { ok: false; error: AuthError },
): void {
	if (result.ok) {
		captured.push(JSON.stringify(result.value));
	} else {
		captured.push(JSON.stringify(result.error));
		const mapped = mapMarkSyncErrorToCommandError(result.error);
		captured.push(JSON.stringify(mapped));
		captured.push(mapped.message);
	}
}

describe("TC-SEC-001 — INV-SEC-1: raw token absent from every captured output (AC-4)", () => {
	const captured: string[] = [];

	beforeAll(async () => {
		const snapshot: Record<string, string | undefined> = {};
		for (const k of ENV_KEYS) snapshot[k] = process.env[k];
		for (const k of ENV_KEYS) delete process.env[k];
		try {
			// resolveCredentials: happy path.
			process.env[ENV_BASE_URL] = BASE_URL;
			process.env[ENV_EMAIL] = EMAIL;
			process.env[ENV_API_TOKEN] = TOKEN;
			captureResult(captured, resolveCredentials());

			// resolveCredentials: each single var missing.
			for (const missing of ENV_KEYS) {
				for (const k of ENV_KEYS) delete process.env[k];
				for (const k of ENV_KEYS) {
					if (k !== missing) {
						process.env[k] =
							k === ENV_BASE_URL ? BASE_URL : k === ENV_EMAIL ? EMAIL : TOKEN;
					}
				}
				captureResult(captured, resolveCredentials());
			}

			// resolveCredentials: all missing.
			for (const k of ENV_KEYS) delete process.env[k];
			captureResult(captured, resolveCredentials());

			// resolveCredentials: malformed base URL.
			process.env[ENV_BASE_URL] = "http://bad.example";
			process.env[ENV_EMAIL] = EMAIL;
			process.env[ENV_API_TOKEN] = TOKEN;
			captureResult(captured, resolveCredentials());

			// validateCredentials: 200 / 401 / 403 against a real Bun.serve mock.
			const server = serveMock((n) =>
				n === 1
					? jsonBody({ accountId: "id-1", displayName: "User One" }, 200)
					: new Response(null, { status: 500 }),
			);
			try {
				captureResult(
					captured,
					await validateCredentials(credsFor(server.origin)),
				);
			} finally {
				server.stop();
			}

			const server401 = serveMock(() => new Response(null, { status: 401 }));
			try {
				captureResult(
					captured,
					await validateCredentials(credsFor(server401.origin)),
				);
			} finally {
				server401.stop();
			}

			const server403 = serveMock(() => new Response(null, { status: 403 }));
			try {
				captureResult(
					captured,
					await validateCredentials(credsFor(server403.origin)),
				);
			} finally {
				server403.stop();
			}

			// validateCredentials: network error (closed port).
			const tmp = Bun.serve({ port: 0, fetch: () => new Response("x") });
			const deadOrigin = `http://localhost:${tmp.port}`;
			tmp.stop(true);
			captureResult(captured, await validateCredentials(credsFor(deadOrigin)));
		} finally {
			for (const k of ENV_KEYS) {
				if (snapshot[k] === undefined) delete process.env[k];
				else process.env[k] = snapshot[k];
			}
		}
	});

	test("the capture is non-empty (the assertion is not vacuous)", () => {
		expect(captured.length).toBeGreaterThan(0);
	});

	test("the raw token substring appears in NO captured string", () => {
		for (const s of captured) {
			expect(s).not.toContain(TOKEN);
		}
	});

	test("no captured string carries a discriminating token prefix", () => {
		for (const s of captured) {
			expect(s).not.toMatch(/ATATT3xFfGF0/);
		}
	});
});

describe("TC-SEC-002 — email masked wherever surfaced; raw email never surfaced (AC-5)", () => {
	test("the resolved credentials carry the masked email, never the raw address", () => {
		for (const k of ENV_KEYS) delete process.env[k];
		process.env[ENV_BASE_URL] = BASE_URL;
		process.env[ENV_EMAIL] = EMAIL;
		process.env[ENV_API_TOKEN] = TOKEN;
		const result = resolveCredentials();
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const serialized = JSON.stringify(result.value);
		expect(serialized).toContain(MASKED_EMAIL);
		expect(serialized).not.toContain(EMAIL); // raw email never surfaces
		expect(serialized).not.toContain(TOKEN);
	});
});

describe("TC-SEC-003 — defense-in-depth: redactString catches the token (AC-4)", () => {
	// The provider never emits the token (TC-SEC-001). This proves the
	// output-time Redactor WOULD scrub it if a stray value ever reached a
	// serialized string — defense-in-depth, not the primary defense.
	test("redactString replaces the atlassian-token-shaped value with the sentinel", () => {
		const redacted = redactString(`config: token=${TOKEN}`);
		expect(redacted).not.toContain(TOKEN);
		expect(redacted).toContain("[REDACTED:atlassian-token]");
	});
});

describe("TC-SEC-004 — CommandResult → OutputService.emit emits no token (DEC-4 defense-in-depth, AC-4)", () => {
	// Route a CommandResult built from a provider AuthError through the REAL
	// OutputService (redact→render→write) on both JSON and human formats, with
	// injectable streams. The emitted stdout/stderr must contain no token.
	test("an AuthError-derived CommandResult emits no token on stdout or stderr (json + human)", () => {
		for (const k of ENV_KEYS) delete process.env[k];
		const result = resolveCredentials(); // MissingCredentials
		expect(result.ok).toBe(false);
		if (result.ok) return;
		const mapped = mapMarkSyncErrorToCommandError(result.error);

		for (const format of ["json", "human"] as const) {
			const stdout = new CaptureStream();
			const stderr = new CaptureStream();
			const service = new OutputService(stdout, stderr);
			const result_envelope = err(
				mapped.code,
				mapped.message,
				mapped.retryable,
				{
					runId: "fixed-for-test",
				},
			);
			service.emit(result_envelope, { format, color: { enabled: false } });

			const combined = `${stdout.text}\n${stderr.text}`;
			expect(combined).not.toContain(TOKEN);
			expect(combined).not.toContain(EMAIL); // raw email never surfaces
			// The stable code surfaces (machine contract); the token never does.
			expect(combined).toContain(mapped.code);
		}
	});
});
