// src/cli/index.ts
//
// Trivial entrypoint — proves the TS+Bun toolchain compiles and executes (F-7).
// Real CLI commands (init, plan, sync, …) land in MS2-E2-S3 under
// src/cli/commands/. Prints the placeholder version `0.0.0`; this story ships no
// released artifact / binary target, so version_impact is `none` (AC-F7-1).
console.log("marksync 0.0.0");
