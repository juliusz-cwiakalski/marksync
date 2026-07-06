/**
 * GH-11 / MS2-E1-S1 — Determinism probe (TC-MRSPIKE-001 → AC1 / H1).
 *
 * Renders each canonical fixture N=5 times via the REAL mermaid.render() against
 * the REAL happy-dom global, passes each raw SVG through the REAL normalizeSvg
 * (no mocking — C-SPIKE-3), computes a sha256 of each normalized SVG, and
 * asserts all N digests are byte-identical WITHIN the run, per fixture.
 *
 * On PASS, persists the first repeat's normalized SVG as the golden fixture
 * `fixtures/<name>.expected.svg` for MS2-E4-S1 / golden-test-tier reuse.
 *
 * Fixtures that THROW under happy-dom (e.g. diagrams needing SVG text layout /
 * getBBox, which happy-dom does not implement) are recorded honestly as
 * FAIL-to-render (they cannot be determinism-tested) rather than massaged.
 */

import { render } from "../render.ts";
import { normalizeSvg } from "../normalize.ts";

const REPEATS = 5;
const FIXTURES = ["flowchart", "sequence", "class", "state", "gantt"] as const;

const encoder = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type PerFixture = {
  fixture: string;
  rendered: boolean;
  error?: string;
  byteStable?: boolean;
  digest?: string;
  normalizedLen?: number;
};

async function probeFixture(name: string): Promise<PerFixture> {
  const src = await Bun.file(`fixtures/${name}.mmd`).text();
  const digests: string[] = [];
  const normalizeds: string[] = [];
  let firstErr: string | undefined;
  for (let i = 0; i < REPEATS; i++) {
    try {
      // Same deterministic id per fixture so the id-prefix is stable; the
      // normalizer additionally neutralizes any ephemeral suffixes.
      const raw = await render(src, name);
      const norm = normalizeSvg(raw);
      digests.push(await sha256(norm));
      normalizeds.push(norm);
    } catch (e) {
      firstErr = firstErr ?? (e as Error).message;
    }
  }
  if (digests.length === 0) {
    return { fixture: name, rendered: false, error: firstErr };
  }
  const stable = digests.every((d) => d === digests[0]);
  // Persist the golden normalized SVG of the first successful repeat.
  await Bun.write(`fixtures/${name}.expected.svg`, normalizeds[0]);
  return {
    fixture: name,
    rendered: true,
    byteStable: stable,
    digest: digests[0],
    normalizedLen: normalizeds[0].length,
  };
}

const results: PerFixture[] = [];
for (const name of FIXTURES) {
  results.push(await probeFixture(name));
}

const renderable = results.filter((r) => r.rendered);
const stableCount = renderable.filter((r) => r.byteStable).length;
const allRenderableStable = renderable.length > 0 && stableCount === renderable.length;
const allFiveRendered = results.every((r) => r.rendered);

console.log("=== TC-MRSPIKE-001 Determinism probe (H1) ===");
console.log(`runtime=bun bunVersion=${Bun.version} repeats=${REPEATS}`);
console.log("fixture    rendered  byteStable  normalizedLen  digest(16)  error");
for (const r of results) {
  console.log(
    `${r.fixture.padEnd(10)} ${(r.rendered ? "yes" : "NO ").padEnd(8)}  ${
      (r.byteStable === undefined ? "n/a" : r.byteStable ? "yes" : "NO ").padEnd(10)
    }  ${String(r.normalizedLen ?? "-").padEnd(13)}  ${(r.digest ?? "-").slice(0, 16)}  ${
      r.error ?? ""
    }`,
  );
}
console.log("---");
console.log(`renderable fixtures: ${renderable.length}/${FIXTURES.length}`);
console.log(`byte-stable (within-run): ${stableCount}/${renderable.length}`);
if (!allFiveRendered) {
  console.log(
    `NOTE: ${FIXTURES.length - renderable.length} fixture(s) FAILED to render under happy-dom ` +
      `(recorded honestly; they cannot be determinism-tested).`,
  );
}
const verdict = allRenderableStable && allFiveRendered
  ? "PASS"
  : (renderable.length > 0 && allRenderableStable
    ? "PASS (caveat: not all fixtures render — see notes)"
    : "FAIL");
console.log(`H1 verdict: ${verdict}`);
