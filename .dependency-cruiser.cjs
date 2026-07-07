/** @type {import('dependency-cruiser').IConfiguration} */
// .dependency-cruiser.cjs — ports-and-adapters tier enforcement (TDR-0006).
//
// The four `forbidden` rules below are copied verbatim from
// `.ai/rules/typescript.md` §"Import-boundary enforcement" and match the
// dependency-direction matrix in doc/overview/architecture-overview.md.
//
// Internal `#imports` aliases (`#domain/*`, `#app/*`, `#infra/*`, `#shared/*`)
// are declared in package.json's `imports` field (DEC-2). dependency-cruiser's
// default resolver follows the Node `imports` field out of the box, so the
// four rules below catch violations in both alias and relative form (verified
// via the Phase 4 negative test — RSK-1 closed). Rule severities are `error`
// so any breach fails the build (AC-F3-2).
module.exports = {
	forbidden: [
		{
			name: "domain-may-not-import-infra",
			from: { path: "src/domain/" },
			to: { path: "src/infra/" },
			severity: "error",
		},
		{
			name: "domain-may-not-import-app",
			from: { path: "src/domain/" },
			to: { path: "src/app/" },
			severity: "error",
		},
		{
			name: "presentation-may-not-import-domain",
			from: { path: "src/cli/" },
			to: { path: "src/domain/" },
			severity: "error",
		},
		{
			name: "presentation-may-not-import-infra",
			from: { path: "src/cli/" },
			to: { path: "src/infra/" },
			severity: "error",
		},
	],
	options: {
		doNotFollow: {
			// skip node_modules and build output while cruising
			path: ["node_modules", "^^/dist"],
		},
		// Resolve package.json `exports`/`imports` fields + TS extensions so
		// dependency-cruiser follows real module paths (no false negatives on
		// barrels/aliases — TDR-0006 C-1). `importsFields` isn't surfaced by
		// dep-cruiser 18; the Node `imports` (#aliases) field is resolved by the
		// default resolver (verified via the Phase 6 negative test / RSK-1).
		enhancedResolveOptions: {
			extensions: [
				".ts",
				".tsx",
				".d.ts",
				".js",
				".jsx",
				".mjs",
				".cjs",
				".json",
			],
			exportsFields: ["exports"],
			mainFields: ["types", "main", "module"],
			conditionNames: ["default", "types", "import"],
		},
	},
};
