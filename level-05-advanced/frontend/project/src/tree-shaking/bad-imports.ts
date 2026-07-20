/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  THESE PATTERNS BREAK TREE SHAKING — here is why           ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Every example below defeats tree shaking for a specific reason.
 * Bundle size costs are approximate but realistic.
 */

// ─── Example 1: Barrel File Problem ────────────────────────────
// BAD: importing from a barrel file (index.ts re-exports)
//
// Even though we only USE formatDate and calculateTax, webpack
// cannot statically determine which exports are used when they
// come through a barrel re-export. The entire utils/index.ts
// module — and all its transitive imports — get bundled.
//
// Cost: ALL exports from utils/index.ts are included (~15KB)
// even though we only use 2 functions (~2KB).
//
// import { formatDate, calculateTax } from "../utils";
// formatDate(new Date(), "yyyy-MM-dd");
// calculateTax(100, 0.2);

// ─── Example 2: CommonJS Require ───────────────────────────────
// BAD: CommonJS require() cannot be tree-shaken
//
// webpack treats require() as a runtime call — it cannot analyze
// which properties of the returned object are accessed at build
// time. The entire module is included.
//
// Cost: Full lodash (~72KB gzipped) even if you only use _.debounce
//
// const _ = require("lodash");
// _.debounce(fn, 300);
// _.throttle(fn, 200);

// ─── Example 3: Side Effect Import ─────────────────────────────
// BAD: mixing CSS import with named import
//
// When you import CSS from a library, webpack marks that library
// as having side effects. This prevents tree shaking of the
// entire library — all named imports are kept as insurance.
//
// Cost: Full library (~50KB) because CSS side effect prevents shaking
//
// import "some-lib/styles.css";
// import { Button } from "some-lib";
// The CSS import forces webpack to keep all of some-lib.

// ─── Example 4: Namespace Import ───────────────────────────────
// BAD: import * as pulls everything
//
// The namespace object references every export. Webpack cannot
// determine which properties are actually accessed at build time
// (they could be accessed dynamically at runtime).
//
// Cost: Full date-fns library (~80KB) even if you only call format()
//
// import * as dateFns from "date-fns";
// dateFns.format(new Date(), "yyyy-MM-dd");
// dateFns.addDays(new Date(), 7);

// ─── Summary of Anti-Patterns ──────────────────────────────────
export const BAD_PATTERNS = [
  {
    pattern: 'import { fn } from "./barrel"',
    reason: 'Barrel re-exports prevent static analysis',
    cost: '~15KB extra',
  },
  {
    pattern: 'const _ = require("lodash")',
    reason: 'CommonJS cannot be tree-shaken',
    cost: '~72KB extra',
  },
  {
    pattern: 'import "lib/styles.css" + import { fn } from "lib"',
    reason: 'CSS side effect prevents shaking entire library',
    cost: '~50KB extra',
  },
  {
    pattern: 'import * as lib from "date-fns"',
    reason: 'Namespace import references all exports',
    cost: '~80KB extra',
  },
] as const;
