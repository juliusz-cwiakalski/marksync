/**
 * GH-11 / MS2-E1-S1 — Probe orchestrator (TC-MRSPIKE-007 + TC-MRSPIKE-005).
 *
 * Runs the full probe pipeline end-to-end under Bun — determinism →
 * chromium-absence → security → fidelity → secrets — each as an ISOLATED Bun
 * subprocess (so happy-dom/mermaid state never bleeds between probes, matching
 * the per-probe `bun run probe:*` invocation). Prints a combined summary and
 * records `bun --version` and the OS/platform.
 *
 * The fact that THIS orchestrator completes via `bun run probe:all` with no
 * Node-only fallback IS the consolidated AC3/H3 evidence (test plan §8.3 / OQ-1):
 * there is no separate "test" for AC3 — runtime invocation is the evidence.
 */
import { join } from "node:path";

const WORKSPACE_ROOT = import.meta.dir.replace("/probes", "");

const STAGES = [
  { name: "determinism", cmd: ["bun", "run", "probes/determinism.ts"], cwd: WORKSPACE_ROOT },
  { name: "chromium-absence", cmd: ["bun", "run", "probes/chromium-absence.ts"], cwd: WORKSPACE_ROOT },
  { name: "security", cmd: ["bun", "run", "probes/security.ts"], cwd: WORKSPACE_ROOT },
  { name: "fidelity", cmd: ["bun", "run", "probes/fidelity.ts"], cwd: WORKSPACE_ROOT },
  { name: "secrets", cmd: ["bash", "scripts/secret-scan.sh"], cwd: WORKSPACE_ROOT },
] as const;

const platform = `${process.platform}/${process.arch}`;
const bunVersion = Bun.version;

console.log("################################################################");
console.log("# GH-11 mermaid-render spike — probe:all (consolidated run)    #");
console.log("################################################################");
console.log(`runtime=bun bunVersion=${bunVersion} platform=${platform}`);
console.log(`started=${new Date().toISOString()}`);
console.log("################################################################\n");

let allOk = true;
const summary: Array<{ stage: string; exit: number; ok: boolean }> = [];

for (const stage of STAGES) {
  console.log(`>>> STAGE: ${stage.name} (${stage.cmd.join(" ")})`);
  const proc = Bun.spawn({
    cmd: stage.cmd as string[],
    cwd: stage.cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exit = await proc.exited;
  const ok = exit === 0;
  summary.push({ stage: stage.name, exit, ok });
  if (!ok) allOk = false;
  console.log(`<<< STAGE: ${stage.name} exit=${exit}\n`);
}

console.log("################################################################");
console.log("# probe:all summary");
console.log("################################################################");
for (const s of summary) {
  console.log(`  ${s.stage.padEnd(20)} exit=${s.exit} ${s.ok ? "OK" : "FAIL"}`);
}
console.log(
  `overall: ${allOk ? "all stages exited 0" : "one or more stages exited non-zero (informative for a spike)"}`,
);
console.log(
  `AC3/H3 evidence: this orchestrator ran end-to-end via Bun ${bunVersion} on ${platform} with no Node-only fallback.`,
);
