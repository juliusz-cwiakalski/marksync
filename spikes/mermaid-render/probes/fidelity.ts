/**
 * GH-11 / MS2-E1-S1 — Fidelity probe (TC-MRSPIKE-004 → AC4 / H4).
 *
 * For each of the 5 canonical diagram types, renders the fixture once via the
 * REAL mermaid.render() against REAL happy-dom (no mocking — C-SPIKE-3), then
 * asserts each output is:
 *   (a) non-empty (length > 0);
 *   (b) well-formed SVG — the string contains an `<svg ...>` root AND a
 *       happy-dom DOMParser parse yields an <svg> document element with
 *       children (a tiny well-formedness check; no heavyweight XML validator);
 *   (c) contains its expected node label(s) as substrings of the SVG text.
 *
 * Records the per-type PASS/FAIL and an overall H4 verdict (PASS requires 5/5).
 *
 * Implemented as a STANDALONE probe (per plan OQ-2 resolution) so each probe is
 * independently reviewable; it reuses the same render loop, not mock output.
 */
import { render } from "../render.ts";

const CASES = [
  { fixture: "flowchart", type: "graph TD", labels: ["Hello", "World"] },
  { fixture: "sequence", type: "sequenceDiagram", labels: ["Alice", "Bob"] },
  { fixture: "class", type: "classDiagram", labels: ["Animal", "Dog"] },
  { fixture: "state", type: "stateDiagram-v2", labels: ["Idle", "Active"] },
  { fixture: "gantt", type: "gantt", labels: ["Build", "Spike"] },
] as const;

// happy-dom is globally registered by render.ts; DOMParser is on the global.
const DomParserCtor = (globalThis as { DOMParser?: typeof DOMParser })
  .DOMParser;

console.log("=== TC-MRSPIKE-004 Fidelity probe (H4) ===");
console.log(`runtime=bun bunVersion=${Bun.version} domParser=${DomParserCtor ? "available" : "UNAVAILABLE"}`);
console.log("---");
console.log(
  "fixture    type              nonEmpty wellFormed(<svg+children) labels      verdict",
);

let passCount = 0;
for (const c of CASES) {
  const src = await Bun.file(`fixtures/${c.fixture}.mmd`).text();
  let svg = "";
  let renderError: string | undefined;
  try {
    svg = await render(src, c.fixture);
  } catch (e) {
    renderError = (e as Error).message;
  }

  const nonEmpty = svg.length > 0;
  // (b) well-formed: raw must contain an <svg element, and a DOM parse must
  //     yield an svg document element with children.
  let wellFormed = false;
  let domRootTag = "n/a";
  if (svg) {
    const hasSvgTag = /<svg[\s>]/i.test(svg);
    let domOk = false;
    if (DomParserCtor) {
      try {
        const doc = new DomParserCtor().parseFromString(svg, "image/svg+xml");
        const root = doc.documentElement;
        domRootTag = root?.tagName?.toLowerCase() ?? "none";
        domOk = !!root && root.childNodes.length > 0 &&
          root.tagName?.toLowerCase() === "svg";
      } catch {
        domOk = false;
        domRootTag = "parse-error";
      }
    }
    wellFormed = hasSvgTag && domOk;
  }
  const hasLabels = c.labels.every((l) => svg.includes(l));

  const pass = !renderError && nonEmpty && wellFormed && hasLabels;
  if (pass) passCount++;
  console.log(
    `${c.fixture.padEnd(10)} ${c.type.padEnd(17)} ${
      String(nonEmpty).padEnd(8)
    } ${String(wellFormed).padEnd(25)} ${
      (renderError ? "throw" : hasLabels ? "yes" : "MISSING").padEnd(10)
    } ${pass ? "PASS" : "FAIL"}`,
  );
  if (renderError) {
    console.log(`            render error: ${renderError}`);
  } else {
    console.log(
      `            svg-len=${svg.length} hasSvgTag=${
        /<svg[\s>]/i.test(svg)
      } domRootTag=${domRootTag} labels=${c.labels.join("+")}`,
    );
  }
}
console.log("---");
console.log(`fidelity pass: ${passCount}/${CASES.length}`);
console.log(`H4 verdict: ${passCount === CASES.length ? "PASS" : "FAIL"}`);
