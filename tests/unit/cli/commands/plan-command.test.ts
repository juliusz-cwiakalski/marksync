// tests/unit/cli/commands/plan-command.test.ts
//
// `planCommand` branch coverage via the in-process `runCli` harness (GH-23).
// Each test drives one early-return path of `src/cli/commands/plan.ts` so the
// presentation→application→domain Result flow is exercised end to end.

import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCli } from "#cli/index";

/**
 * Env vars read transitively by `planCommand` (credentials + the git/branch
 * knobs its callees consult). Saved/restored around every test.
 */
const ENV_KEYS = [
	"MARKSYNC_CONFLUENCE_BASE_URL",
	"MARKSYNC_USER_EMAIL",
	"MARKSYNC_API_TOKEN",
	"MARKSYNC_ALLOW_BRANCHES",
	"GIT_DIR",
] as const;

const FIXTURE = join(import.meta.dir, "../../app/fixtures/valid-minimal.yml");

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

describe("planCommand — runCli branch coverage (--json)", () => {
	let dir: string;
	let origCwd: string;
	let envSnap: Record<string, string | undefined>;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "ms-plan-"));
		origCwd = process.cwd();
		envSnap = {};
		for (const k of ENV_KEYS) envSnap[k] = process.env[k];
		for (const k of ENV_KEYS) delete process.env[k];
		process.chdir(dir);
	});

	afterEach(() => {
		process.chdir(origCwd);
		rmSync(dir, { recursive: true, force: true });
		for (const k of ENV_KEYS) {
			if (envSnap[k] === undefined) delete process.env[k];
			else process.env[k] = envSnap[k];
		}
	});

	function setValidCreds(): void {
		process.env.MARKSYNC_CONFLUENCE_BASE_URL = "https://example.atlassian.net";
		process.env.MARKSYNC_USER_EMAIL = "tester@example.com";
		process.env.MARKSYNC_API_TOKEN = "ATATT3xFfGF0SECRET_TOKEN_VALUE_x9";
	}

	async function runPlanJson(): Promise<{
		exit: number;
		parsed: Record<string, unknown>;
	}> {
		const s = newStreams();
		const exit = await runCli(["plan", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});
		return {
			exit,
			parsed: JSON.parse(s.stdout.joined()) as Record<string, unknown>,
		};
	}

	test("1. no marksync.yml → INVALID_CONFIG, exit 10", async () => {
		const { exit, parsed } = await runPlanJson();
		expect(exit).toBe(10);
		expect(parsed.schema_version).toBe(1);
		expect(parsed.exit_code).toBe(10);
		expect((parsed.error as Record<string, unknown>).code).toBe(
			"INVALID_CONFIG",
		);
	});

	test("2. corrupt marksync.lock.yml → CORRUPT_LOCK, exit 10", async () => {
		copyFileSync(FIXTURE, join(dir, "marksync.yml"));
		writeFileSync(join(dir, "marksync.lock.yml"), ": bad: [yaml");
		const { exit, parsed } = await runPlanJson();
		expect(exit).toBe(10);
		expect(parsed.exit_code).toBe(10);
		expect((parsed.error as Record<string, unknown>).code).toBe("CORRUPT_LOCK");
	});

	test("3. missing credentials → AUTH_MISSING_CREDENTIALS, exit 20", async () => {
		copyFileSync(FIXTURE, join(dir, "marksync.yml"));
		const { exit, parsed } = await runPlanJson();
		expect(exit).toBe(20);
		expect(parsed.exit_code).toBe(20);
		expect((parsed.error as Record<string, unknown>).code).toBe(
			"AUTH_MISSING_CREDENTIALS",
		);
	});

	test("4. no default target → INVALID_CONFIG, exit 10", async () => {
		writeFileSync(
			join(dir, "marksync.yml"),
			`version: 1
root: docs/
targets:
  other:
    type: confluence
    spaceKey: ENG
    parentPageId: "123"
`,
		);
		setValidCreds();
		const { exit, parsed } = await runPlanJson();
		expect(exit).toBe(10);
		expect(parsed.exit_code).toBe(10);
		const error = parsed.error as Record<string, unknown>;
		expect(error.code).toBe("INVALID_CONFIG");
		expect(error.message).toContain("no default target");
	});

	test("5. computePlan failure (git unreachable) → INTERNAL, exit 99", async () => {
		copyFileSync(FIXTURE, join(dir, "marksync.yml"));
		setValidCreds();
		// Deterministic across dev (TMPDIR inside a repo) and CI (TMPDIR=/tmp):
		// pointing GIT_DIR at a missing path makes computePlan's branch-gate git
		// probe fail → throw → INTERNAL, regardless of host repo layout.
		process.env.GIT_DIR = join(dir, ".nonexistent-git");
		const { exit, parsed } = await runPlanJson();
		expect(exit).toBe(99);
		expect(parsed.exit_code).toBe(99);
		expect((parsed.error as Record<string, unknown>).code).toBe("INTERNAL");
	});
});
