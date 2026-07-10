// src/cli/output/redact.ts
//
// Presentation re-export of the canonical redaction layer (GH-16 D-4 / F-4 /
// INV-SEC-1 / NFR-SEC-2 / ADR-0011 C-5). The OutputService chokepoint applies
// `redactString` to every SERIALIZED output string (DEC-4) so a token nested
// anywhere inside `data` is scrubbed before any byte reaches a stream.
//
// The implementation lives in `src/shared/redact.ts` — the single source of
// truth — so BOTH the presentation chokepoint AND the infra transport
// (`src/infra/confluence/client.ts` redacted request/response logging) share one
// pattern set. This avoids the drift an infra-local mirror would reintroduce
// (GH-21 review iter-2: the prior mirror had already dropped the `env-token`
// arm and used non-canonical sentinels). dep-cruiser permits every tier to
// import `#shared/*`, so this re-export keeps `#cli/output` a single import root
// while removing the duplication.

export {
	DEFAULT_PATTERNS,
	DEFAULT_REDACTOR,
	Redactor,
	createRedactor,
	redactString,
} from "#shared/redact";
export type { RedactionKind, RedactionPattern } from "#shared/redact";
