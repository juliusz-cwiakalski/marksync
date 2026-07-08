// src/cli/index.ts
//
// Trivial entrypoint — proves the TS+Bun toolchain compiles and executes (F-7).
// Real CLI commands (init, plan, sync, …) land in MS2-E2-S3 under
// src/cli/commands/. Prints the package version; bumped to `0.1.0` by GH-15
// (version_impact: minor). Kept in lock-step with `package.json` until a
// runtime version source is wired in a later story.
console.log("marksync 0.1.0");
