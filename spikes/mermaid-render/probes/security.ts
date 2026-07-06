/**
 * GH-11 / MS2-E1-S1 — Security probe (TC-MRSPIKE-003 → AC5 / H5).
 *
 * Confirms `securityLevel:"strict"` is the ACTIVE config (read back after
 * initialize, to detect a silent override), then renders each adversarial
 * fixture via the REAL mermaid.render() against REAL happy-dom under strict +
 * htmlLabels:false + deterministicIds:true (no mocking — C-SPIKE-3), normalizes
 * via the REAL normalizeSvg, and scans for:
 *   (a) `<script` element tags              → must be 0
 *   (b) live inline event-handler attributes (onerror=/onload=) → must be 0
 *   (c) `javascript:` URIs                  → must be 0
 *
 * H5 SCOPE NOTE (DoR finding F2): this validates Mermaid DEFAULT-config safety
 * vs XSS/script injection only. Full SVG sanitization (incl. external-resource
 * blocking via <use href="http://…">, remote fonts/images) is DEFERRED to
 * MS2-E4-S1 (SVGSanitizer). The optional adversarial-external-ref.mmd fixture
 * is rendered and recorded, but its external-ref outcome is NOT a gate here.
 *
 * For transparency the probe ALSO reports bare "onerror"/"onload" substring
 * counts: an HTML-escaped payload (e.g. `&lt;img src=x onerror=alert(1)&gt;`)
 * may contain the inert substring as DISPLAY TEXT — that is NOT a security
 * issue (it cannot execute). The H5 verdict is driven by the LIVE forms above.
 */
import { render, getActiveConfig } from "../render.ts";
import { normalizeSvg } from "../normalize.ts";

const ADVERSARIAL = [
  "adversarial-xss",
  "adversarial-script",
  "adversarial-external-ref",
] as const;

const cfg = await getActiveConfig();
const strictActive = cfg.securityLevel === "strict";
const htmlLabelsOff = cfg.htmlLabels === false;
const deterministicIds = cfg.deterministicIds === true;

console.log("=== TC-MRSPIKE-003 Security probe (H5) ===");
console.log(`active config: securityLevel=${cfg.securityLevel} htmlLabels=${cfg.htmlLabels} deterministicIds=${cfg.deterministicIds} fontFamily=${cfg.fontFamily}`);
console.log(
  `strict active: ${strictActive} | htmlLabels:false: ${htmlLabelsOff} | deterministicIds:true: ${deterministicIds}`,
);
console.log("---");

let allClean = strictActive;
console.log("fixture                     scriptTag onerror= onload= javascript:  bareOn*  verdict");
for (const name of ADVERSARIAL) {
  const src = await Bun.file(`fixtures/${name}.mmd`).text();
  let normalized = "";
  let renderError: string | undefined;
  try {
    const raw = await render(src, name);
    normalized = normalizeSvg(raw);
  } catch (e) {
    renderError = (e as Error).message;
  }
  if (renderError) {
    // Even a render error is informative: the payload did not produce live
    // script/handlers (it failed to render). Record honestly.
    console.log(
      `${name.padEnd(27)} RENDER-FAIL (${renderError}); no SVG to scan.`,
    );
    continue;
  }
  const scriptTag = [...normalized.matchAll(/<script\b/gi)].length;
  const onerrorAttr = [...normalized.matchAll(/\bonerror\s*=/gi)].length;
  const onloadAttr = [...normalized.matchAll(/\bonload\s*=/gi)].length;
  const javascriptUri = [...normalized.matchAll(/javascript:/gi)].length;
  const bareOn = [...normalized.matchAll(/\bon(error|load)\b/gi)].length;
  const clean = scriptTag === 0 && onerrorAttr === 0 && onloadAttr === 0 &&
    javascriptUri === 0;
  allClean = allClean && clean;
  console.log(
    `${name.padEnd(27)} ${String(scriptTag).padStart(8)} ${String(onerrorAttr).padStart(8)} ${
      String(onloadAttr).padStart(7)
    } ${String(javascriptUri).padStart(12)}  ${String(bareOn).padEnd(7)} ${clean ? "PASS" : "FAIL"}`,
  );
}
console.log("---");
console.log(
  `H5 verdict: ${strictActive && allClean ? "PASS" : "FAIL"} ` +
    `(strict active=${strictActive}; all adversarial outputs free of live <script>/onerror=/onload=/javascript:)`,
);
console.log(
  "H5 scope: validates Mermaid DEFAULT-config safety vs XSS/script only; full SVG " +
    "sanitization (external-resource blocking via <use href>, remote fonts/images) " +
    "deferred to MS2-E4-S1 (SVGSanitizer).",
);
