// tests/mermaid.preload.ts — Mermaid-DOM preload stub (DEC-5 / CEO R1).
//
// This is intentionally a no-op. E4-S1 (MS2-E4) will populate this module with
// the happy-dom global registrant so that Mermaid rendering tests run in-process:
//
//   import { GlobalRegistrator } from "@happy-dom/global-registrator";
//   GlobalRegistrator.register();
//
// Until then this file exists only so that bunfig.toml's `preload` entry
// resolves without warning or failure. Do not add side effects here.
export {};
