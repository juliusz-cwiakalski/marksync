// tests/unit/cli/commands/router.test.ts
//
// Unit tests for the Cliffy command router (GH-16 D-8 / F-8 / AC-2). Asserts:
//   - all five subcommands are registered and their actions capture a run;
//   - global flags (`--json`/`--output`/`--color`/`--no-color`/`--quiet`) are
//     parsed and flow into the resolved format + color policy;
//   - format/color resolution helpers (`resolveOutputFormat`,
//     `resolveColorPolicyFromFlags`) behave per spec F-8/F-6;
//   - unknown commands + bad `--output` values throw (catchable — the entrypoint
//     translates these into USAGE results, exit 2).
//
// NOTE: `--help`/`--version` are NOT tested here — Cliffy calls
// `process.exit(0)` for them internally, which would kill the test runner. They
// are covered by the Phase 1 smoke test + Phase 7 integration tests.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	buildCommand,
	resolveColorPolicyFromFlags,
	resolveOutputFormat,
} from "#cli/commands/router";

describe("resolveOutputFormat — global flag → format mapping (F-8)", () => {
	test("--json → json (shorthand for --output=json)", () => {
		expect(resolveOutputFormat({ json: true })).toBe("json");
	});

	test("--json takes precedence over --output", () => {
		expect(resolveOutputFormat({ json: true, output: "human" })).toBe("json");
		expect(resolveOutputFormat({ json: true, output: "ndjson" })).toBe("json");
	});

	test("--output json → json", () => {
		expect(resolveOutputFormat({ output: "json" })).toBe("json");
	});

	test("--output ndjson → ndjson", () => {
		expect(resolveOutputFormat({ output: "ndjson" })).toBe("ndjson");
	});

	test("--output human → human", () => {
		expect(resolveOutputFormat({ output: "human" })).toBe("human");
	});

	test("no flags → human (default)", () => {
		expect(resolveOutputFormat({})).toBe("human");
	});
});

describe("resolveColorPolicyFromFlags — color flag → policy (F-6 / NFR-A11Y-1)", () => {
	test("color: true → enabled (force on)", () => {
		expect(resolveColorPolicyFromFlags({ color: true }).enabled).toBe(true);
	});

	test("color: false → disabled (--no-color, force off)", () => {
		expect(resolveColorPolicyFromFlags({ color: false }).enabled).toBe(false);
	});

	test("color: undefined → auto-detect (respects TTY/CI/NO_COLOR/TERM)", () => {
		// The actual value depends on the test environment (non-interactive by
		// default in bun:test). We assert it returns a ColorPolicy object; the
		// full auto-detect matrix is tested in color.test.ts.
		const policy = resolveColorPolicyFromFlags({});
		expect(typeof policy.enabled).toBe("boolean");
	});
});

describe("buildCommand — subcommand registration + flag capture (D-8)", () => {
	// Override process.cwd() so the `init` action (which defaults to
	// process.cwd()) writes to a temp dir, NOT the repo root.
	const realCwd = process.cwd;
	let tempCwd: string;

	beforeEach(() => {
		tempCwd = mkdtempSync(join(tmpdir(), "marksync-router-test-"));
		process.cwd = () => tempCwd;
	});

	afterEach(() => {
		process.cwd = realCwd;
		rmSync(tempCwd, { recursive: true, force: true });
	});

	const subcommands = ["init", "plan", "sync", "doctor", "repair-state"];

	for (const name of subcommands) {
		test(`${name}: action fires and captures a CommandResult`, async () => {
			const { command, getRun } = buildCommand();
			await command.parse([name]);
			const run = getRun();
			expect(run).not.toBeNull();
			expect(run?.command).toBe(name);
			expect(run?.result.schemaVersion).toBe(1);
			expect(typeof run?.result.exitCode).toBe("number");
		});
	}

	test("global --json flag is parsed and flows into the captured format", async () => {
		const { command, getRun } = buildCommand();
		await command.parse(["plan", "--json"]);
		expect(getRun()?.format).toBe("json");
	});

	test("global --output ndjson flag flows into the captured format", async () => {
		const { command, getRun } = buildCommand();
		await command.parse(["sync", "--output", "ndjson"]);
		expect(getRun()?.format).toBe("ndjson");
	});

	test("--json takes precedence over --output in the captured format", async () => {
		const { command, getRun } = buildCommand();
		await command.parse(["doctor", "--output", "human", "--json"]);
		expect(getRun()?.format).toBe("json");
	});

	test("--quiet flag flows into the captured quiet flag", async () => {
		const { command, getRun } = buildCommand();
		await command.parse(["plan", "--quiet"]);
		expect(getRun()?.quiet).toBe(true);
	});

	test("--quiet absent → quiet is false", async () => {
		const { command, getRun } = buildCommand();
		await command.parse(["plan"]);
		expect(getRun()?.quiet).toBe(false);
	});

	test("--color flag forces color enabled in the captured policy", async () => {
		const { command, getRun } = buildCommand();
		await command.parse(["plan", "--color"]);
		expect(getRun()?.color.enabled).toBe(true);
	});

	test("--no-color flag forces color disabled in the captured policy", async () => {
		const { command, getRun } = buildCommand();
		await command.parse(["plan", "--no-color"]);
		expect(getRun()?.color.enabled).toBe(false);
	});

	test("global flags can appear BEFORE the subcommand", async () => {
		const { command, getRun } = buildCommand();
		await command.parse(["--json", "plan"]);
		expect(getRun()?.format).toBe("json");
		expect(getRun()?.command).toBe("plan");
	});
});

describe("buildCommand — error handling (Cliffy .throwErrors)", () => {
	const realCwd = process.cwd;
	let tempCwd: string;

	beforeEach(() => {
		tempCwd = mkdtempSync(join(tmpdir(), "marksync-router-err-test-"));
		process.cwd = () => tempCwd;
	});

	afterEach(() => {
		process.cwd = realCwd;
		rmSync(tempCwd, { recursive: true, force: true });
	});

	test("unknown command throws (entrypoint → USAGE)", async () => {
		const { command } = buildCommand();
		expect(command.parse(["bogus-command"])).rejects.toThrow();
	});

	test("bad --output value throws ValidationError", async () => {
		const { command } = buildCommand();
		expect(command.parse(["plan", "--output", "xml"])).rejects.toThrow();
	});

	test("unknown option throws", async () => {
		const { command } = buildCommand();
		expect(command.parse(["plan", "--bogus-flag"])).rejects.toThrow();
	});

	test("init produces a run even on config failure (exit 10, not a throw)", async () => {
		// The init handler returns a CommandResult (never throws) — even on
		// failure the run is captured with the mapped error code.
		const { command, getRun } = buildCommand();
		// Running init in a directory that may already have a config — either way
		// the action fires and captures a run (exit 0 or 10), never throws.
		await command.parse(["init"]);
		const run = getRun();
		expect(run).not.toBeNull();
		expect(run?.command).toBe("init");
		expect([0, 10]).toContain(run?.result.exitCode);
	});
});
