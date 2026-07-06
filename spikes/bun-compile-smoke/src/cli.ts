/**
 * GH-13 / MS2-E1-S3 — Bun single-binary cross-compile smoke CLI.
 *
 * This is a **smoke binary**, NOT the real MarkSync CLI (spec NG-3). Its sole
 * purpose is to exercise the Bun runtime bootstrap embedded in a `bun build
 * --compile`-produced single binary, so the cross-compile + clean-OS-run
 * hypotheses (H1, H2) can be validated without the real CLI feature set.
 *
 * Plain `console.log` is intentional — a smoke binary does not need a CLI
 * framework (Cliffy is optional per the story methodology step-1; not used here).
 */

const VERSION = "marksync 0.0.0";

// The clean-OS smoke invokes `./marksync-linux-x64 --version` (and `version`);
// honor both by printing the same synthetic version string. No other behaviour.
const arg = process.argv[2];
if (arg === "--version" || arg === "version" || arg === "-v") {
  console.log(VERSION);
} else {
  // Default: print the version string (the smoke contract).
  console.log(VERSION);
}
