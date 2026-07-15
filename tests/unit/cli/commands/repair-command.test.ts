// tests/unit/cli/commands/repair-command.test.ts
//
// `repairStateCommand` branch coverage (GH-28). Early-return paths use the
// `runCli` harness (mirrors sync-command.test.ts); the runRepair tails are
// driven by a mocked `#app/repair` (the real runRepair needs a live target).

import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { runCli } from "#cli/index";
import { repairStateCommand } from "#cli/commands/repair-state";

/**
 * Env vars read transitively by `repairStateCommand` (credentials + the git
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

/** Fake report the mocked runRepair resolves with on the success path. */
const FAKE_REPORT = {
	runId: "repair-fake-run-id",
	dryRun: true,
	items: [],
	interruptedRunDetected: false,
	writes: 0,
} as const;

/**
 * The Result the mocked runRepair returns, swapped per test. Bun hoists
 * `mock.module` above imports; the factory's closure reads this lazily at call
 * time (never during hoisting), so there is no temporal-dead-zone hazard.
 */
let nextRepairResult:
	| { ok: true; value: typeof FAKE_REPORT }
	| { ok: false; error: { kind: "RemoteUnreachable"; cause: string } } = {
	ok: true,
	value: FAKE_REPORT,
};

/** Captures the last opts block handed to runRepair so tests can assert wiring. */
let lastRepairOpts: { dryRun?: boolean; targetId?: string } | undefined;

mock.module("#app/repair", () => ({
	runRepair: async (
		_lock: unknown,
		_git: unknown,
		_target: unknown,
		_config: unknown,
		opts: { dryRun?: boolean; targetId?: string },
	) => {
		lastRepairOpts = opts;
		return nextRepairResult;
	},
}));

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

describe("repairStateCommand — branch coverage", () => {
	let dir: string;
	let origCwd: string;
	let envSnap: Record<string, string | undefined>;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "ms-repair-"));
		origCwd = process.cwd();
		envSnap = {};
		for (const k of ENV_KEYS) envSnap[k] = process.env[k];
		for (const k of ENV_KEYS) delete process.env[k];
		nextRepairResult = { ok: true, value: FAKE_REPORT };
		lastRepairOpts = undefined;
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

	async function runRepairStateJson(): Promise<{
		exit: number;
		parsed: Record<string, unknown>;
	}> {
		const s = newStreams();
		const exit = await runCli(["repair-state", "--json"], {
			stdout: s.stdout_w,
			stderr: s.stderr_w,
		});
		return {
			exit,
			parsed: JSON.parse(s.stdout.joined()) as Record<string, unknown>,
		};
	}

	test("1. no marksync.yml → INVALID_CONFIG, exit 10", async () => {
		const { exit, parsed } = await runRepairStateJson();
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
		const { exit, parsed } = await runRepairStateJson();
		expect(exit).toBe(10);
		expect(parsed.exit_code).toBe(10);
		expect((parsed.error as Record<string, unknown>).code).toBe("CORRUPT_LOCK");
	});

	test("3. missing credentials → AUTH_MISSING_CREDENTIALS, exit 20", async () => {
		copyFileSync(FIXTURE, join(dir, "marksync.yml"));
		const { exit, parsed } = await runRepairStateJson();
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
		const { exit, parsed } = await runRepairStateJson();
		expect(exit).toBe(10);
		expect(parsed.exit_code).toBe(10);
		const error = parsed.error as Record<string, unknown>;
		expect(error.code).toBe("INVALID_CONFIG");
		expect(error.message).toContain("no default target");
	});

	test("5. runRepair failure → mapped error (REMOTE_UNREACHABLE), exit 99", async () => {
		copyFileSync(FIXTURE, join(dir, "marksync.yml"));
		setValidCreds();
		nextRepairResult = {
			ok: false,
			error: { kind: "RemoteUnreachable", cause: "mocked transport failure" },
		};
		const result = await repairStateCommand({ dryRun: true });
		expect(result.exitCode).toBe(99);
		expect(result.error?.code).toBe("REMOTE_UNREACHABLE");
		expect(result.error?.retryable).toBe(true);
		expect(lastRepairOpts?.dryRun).toBe(true);
	});

	test("6. runRepair success → ok, report flows through (exit 0)", async () => {
		copyFileSync(FIXTURE, join(dir, "marksync.yml"));
		setValidCreds();
		const result = await repairStateCommand({ dryRun: true });
		expect(result.exitCode).toBe(0);
		expect(result.error).toBeUndefined();
		expect(result.data).toEqual(FAKE_REPORT);
		expect(lastRepairOpts).toMatchObject({
			dryRun: true,
			targetId: "default",
		});
	});
});
