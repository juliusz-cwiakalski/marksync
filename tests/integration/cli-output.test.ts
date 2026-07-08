// tests/integration/cli-output.test.ts
//
// Integration tests — prove the CLI output pipeline holds end-to-end on REAL
// emitted bytes from a REAL subprocess (the over-mocking guardrail: INV-SEC-1 is
// validated on captured stdout/stderr, never via a mock that asserts "redact was
// called"). GH-16 TC-INT-001 (INV-SEC-1), TC-INT-002 (NFR-A11Y-1 auto-decolor),
// TC-INT-003 (AC-6 exit code).
//
// The fixture `tests/integration/fixtures/emit-result.ts` builds a CommandResult
// inline and routes it through the REAL OutputService to real stdout/stderr — so
// the bytes captured here crossed the genuine non-bypassable redact→render→write
// chokepoint (exactly the surface INV-SEC-1 must hold on).

import { describe, expect, test } from "bun:test";

const FIXTURE = "tests/integration/fixtures/emit-result.ts";
const ENTRY = "src/cli/index.ts";

interface SpawnResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

function spawn(args: string[], env: Record<string, string> = {}): SpawnResult {
	const result = Bun.spawnSync({
		cmd: ["bun", ...args],
		cwd: process.cwd(),
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...env },
	});
	return {
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
		exitCode: result.exitCode,
	};
}

/** An ESC (U+001B) in the output means an ANSI escape sequence was emitted. */
function hasAnsi(s: string): boolean {
	return s.includes("\u001b");
}

describe("TC-INT-001 — INV-SEC-1: token redacted on real captured output (AC-1)", () => {
	test("a token embedded in data.pageBody does NOT appear in stdout or stderr", () => {
		// A realistic GitHub-token-shaped value the redactor must scrub: the `gho_`
		// prefix + 36 alphanumeric chars (no underscores — real gho tokens are
		// [A-Za-z0-9] after the prefix; underscores would be over-redaction territory).
		const token = "gho_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
		const { stdout, stderr } = spawn([FIXTURE, "token"], {
			MARKSYNC_TEST_TOKEN: token,
		});

		// The token was embedded in data.pageBody; the OutputService must redact it
		// from the serialized JSON before any byte reaches the stream (DEC-4).
		expect(stdout).not.toContain(token);
		expect(stderr).not.toContain(token);

		// The output is still valid JSON (redaction did not corrupt the envelope).
		const parsed = JSON.parse(stdout);
		expect(parsed.schema_version).toBe(1);
		expect(parsed.exit_code).toBe(0);
	});
});

describe("TC-INT-002 — NFR-A11Y-1: non-interactive color auto-disable (AC-3)", () => {
	test("piped stdout (non-TTY) → zero ANSI codes anywhere", () => {
		// A subprocess's stdout is a pipe → isTTY === false → color auto-disabled.
		// The `plan` stub returns an error; human error output routes to stderr,
		// so check the combined stream to cover both routing paths.
		const { stdout, stderr } = spawn([ENTRY, "plan", "--output=human"]);
		expect(hasAnsi(stdout)).toBe(false);
		expect(hasAnsi(stderr)).toBe(false);
	});

	test("--color forces ANSI on even when piped", () => {
		const { stdout, stderr } = spawn([
			ENTRY,
			"plan",
			"--output=human",
			"--color",
		]);
		// Color is forced on despite the piped (non-TTY) stdout — the override wins.
		expect(hasAnsi(stdout) || hasAnsi(stderr)).toBe(true);
	});

	test("--no-color forces ANSI off", () => {
		const { stdout, stderr } = spawn([
			ENTRY,
			"plan",
			"--output=human",
			"--no-color",
		]);
		expect(hasAnsi(stdout)).toBe(false);
		expect(hasAnsi(stderr)).toBe(false);
	});
});

describe("TC-INT-003 — AC-6: CONFLICT error.code → process exits 30", () => {
	test("a CONFLICT CommandResult exits with code 30 and emits the code", () => {
		const { exitCode, stdout } = spawn([FIXTURE, "conflict"]);
		expect(exitCode).toBe(30);

		const parsed = JSON.parse(stdout);
		expect(parsed.error.code).toBe("CONFLICT");
		expect(parsed.exit_code).toBe(30);
		expect(parsed.schema_version).toBe(1);
	});
});
