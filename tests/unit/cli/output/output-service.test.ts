// tests/unit/cli/output/output-service.test.ts
//
// Unit tests for the OutputService chokepoint (GH-16 D-7 / F-7 / AC-1 / AC-2 /
// ADR-0011 C-5 / INV-SEC-1 / DEC-4 / TC-OUT-001). Asserts the redact → render →
// write → return-exitCode pipeline on captured buffers (injectable writable
// streams): a token in `data` is redacted on EVERY format path (INV-SEC-1);
// `--json` writes JSON to stdout; `--output=human` writes human to stdout /
// errors to stderr; `--quiet` suppresses non-error human stdout; emit returns
// the result's exitCode.

import { describe, expect, test } from "bun:test";
import {
	err,
	ok,
	type CommandResult,
} from "../../../../src/cli/output/command-result.ts";
import { emit, OutputService } from "../../../../src/cli/output/index.ts";
import {
	clearHumanFormatterRegistry,
	registerHumanFormatter,
} from "../../../../src/cli/output/human.ts";

/** A minimal in-memory writable that captures every `write` chunk. */
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

// A synthetic GitHub token embedded in `data` — only exposed after
// JSON.stringify. Real-output grep (never a mock call) proves INV-SEC-1.
const GHO = "gho_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function newService(): {
	service: OutputService;
	stdout: CaptureStream;
	stderr: CaptureStream;
} {
	const stdout = new CaptureStream();
	const stderr = new CaptureStream();
	const service = new OutputService(stdout, stderr);
	return { service, stdout, stderr };
}

describe("OutputService.emit — redacts on every format path (INV-SEC-1 / DEC-4)", () => {
	test("JSON: a token nested in data is scrubbed from stdout (TC-OUT-001 / AC-1)", () => {
		const { service, stdout, stderr } = newService();
		const result = ok({ pageBody: `see ${GHO} embedded` }, { runId: "r" });
		const exit = service.emit(result, { format: "json" });
		expect(stdout.joined()).not.toContain(GHO);
		expect(stdout.joined()).toContain("[REDACTED:github-token]");
		expect(stderr.joined()).toBe("");
		expect(exit).toBe(0);
	});

	test("NDJSON: a token nested in data is scrubbed", () => {
		const { service, stdout } = newService();
		service.emit(ok({ body: `token ${GHO}` }, { runId: "r" }), {
			format: "ndjson",
		});
		expect(stdout.joined()).not.toContain(GHO);
	});

	test("human: a token in data is scrubbed from stdout", () => {
		const { service, stdout } = newService();
		service.emit(ok({ body: `token ${GHO}` }, { runId: "r" }), {
			format: "human",
			color: { enabled: false },
		});
		expect(stdout.joined()).not.toContain(GHO);
	});

	test("human: a token in error.message is scrubbed from stderr", () => {
		const { service, stdout, stderr } = newService();
		const result = err("INTERNAL", `crash with ${GHO}`, false, { runId: "r" });
		service.emit(result, { format: "human", color: { enabled: false } });
		expect(stderr.joined()).not.toContain(GHO);
		expect(stdout.joined()).toBe("");
	});
});

describe("OutputService.emit — format routing", () => {
	test("--json → parseable JSON on stdout (snake_case keys)", () => {
		const { service, stdout, stderr } = newService();
		const result = ok({ pageId: "123" }, { runId: "run-1" });
		service.emit(result, { format: "json" });
		const parsed = JSON.parse(stdout.joined()) as Record<string, unknown>;
		expect(parsed.schema_version).toBe(1);
		expect(parsed.run_id).toBe("run-1");
		expect(parsed.exit_code).toBe(0);
		expect(stderr.joined()).toBe("");
	});

	test("--output=human → human key-value text on stdout (success)", () => {
		const { service, stdout, stderr } = newService();
		const result = ok({ pageId: "123" }, { runId: "run-1" });
		service.emit(result, { format: "human", color: { enabled: false } });
		expect(stdout.joined()).toContain("run: run-1");
		expect(stdout.joined()).toContain("exit: 0");
		expect(stderr.joined()).toBe("");
	});

	test("--output=human error → routed to stderr, not stdout", () => {
		const { service, stdout, stderr } = newService();
		const result = err("CONFLICT", "remote ahead", true, { runId: "r" });
		service.emit(result, { format: "human", color: { enabled: false } });
		expect(stderr.joined()).toContain("error: CONFLICT");
		expect(stdout.joined()).toBe("");
	});

	test("--quiet suppresses non-error human stdout; errors still emit to stderr", () => {
		const { service: s1, stdout: o1, stderr: e1 } = newService();
		// Success + --quiet → nothing on stdout.
		s1.emit(ok("ok", { runId: "r" }), {
			format: "human",
			color: { enabled: false },
			quiet: true,
		});
		expect(o1.joined()).toBe("");
		expect(e1.joined()).toBe("");

		// Error + --quiet → still surfaces on stderr.
		const { service: s2, stdout: o2, stderr: e2 } = newService();
		s2.emit(err("CONFLICT", "x", true, { runId: "r" }), {
			format: "human",
			color: { enabled: false },
			quiet: true,
		});
		expect(o2.joined()).toBe("");
		expect(e2.joined()).toContain("error: CONFLICT");
	});

	test("--quiet does NOT affect JSON output (machine contract preserved)", () => {
		const { service, stdout } = newService();
		service.emit(ok({ ok: true }, { runId: "r" }), {
			format: "json",
			quiet: true,
		});
		const parsed = JSON.parse(stdout.joined()) as Record<string, unknown>;
		expect(parsed.run_id).toBe("r");
	});

	test("registered human formatter is resolved via opts.command (AC-7 through the chokepoint)", () => {
		// Unique command name + finally cleanup so the shared registry is not
		// disturbed for other suites if bun shares module state across files.
		const CMD = "plan-output-service-test";
		try {
			registerHumanFormatter(CMD, (r) => `PLAN-RICH run=${r.runId}`);
			const { service, stdout } = newService();
			service.emit(ok({ pageId: "1" }, { runId: "run-9" }), {
				format: "human",
				color: { enabled: false },
				command: CMD,
			});
			expect(stdout.joined()).toContain("PLAN-RICH run=run-9");
		} finally {
			clearHumanFormatterRegistry();
		}
	});
});

describe("OutputService.emit — returns the result exitCode (F-1 / AC-6)", () => {
	test("success → 0", () => {
		const { service } = newService();
		expect(service.emit(ok("x", { runId: "r" }), { format: "json" })).toBe(0);
	});

	test("CONFLICT error → 30 (AC-6 load-bearing)", () => {
		const { service } = newService();
		const result: CommandResult<never> = err("CONFLICT", "remote ahead", true, {
			runId: "r",
		});
		expect(service.emit(result, { format: "json" })).toBe(30);
	});

	test("INVALID_CONFIG error → 10", () => {
		const { service } = newService();
		expect(
			service.emit(err("INVALID_CONFIG", "bad", false, { runId: "r" }), {
				format: "human",
			}),
		).toBe(10);
	});
});

describe("OutputService.emit — default color (no color policy) is disabled (safe)", () => {
	test("human output without opts.color contains no ANSI", () => {
		const { service, stdout } = newService();
		service.emit(ok("ok", { runId: "r" }), { format: "human" });
		const out = stdout.joined();
		// No ESC (0x1b) anywhere — safe default when no color policy is supplied.
		expect(out.codePointAt(0)).not.toBe(0x1b);
		for (let i = 0; i < out.length; i++) {
			expect(out.codePointAt(i)).not.toBe(0x1b);
		}
	});
});

describe("module-level emit() — default OutputService convenience", () => {
	test("delegates to the default OutputService bound to process streams", () => {
		// Capture process.stdout.write to prove the module-level convenience
		// routes through the real default instance (redacts + returns exitCode).
		const original = process.stdout.write.bind(process.stdout);
		let captured = "";
		process.stdout.write = ((chunk: string) => {
			captured += chunk;
			return true;
		}) as typeof process.stdout.write;
		try {
			const exit = emit(ok({ body: `tok ${GHO}` }, { runId: "r" }), {
				format: "json",
			});
			expect(exit).toBe(0);
			// The default instance still redacts (INV-SEC-1 through the convenience).
			expect(captured).not.toContain(GHO);
			expect(captured).toContain("run_id");
		} finally {
			process.stdout.write = original;
		}
	});
});
