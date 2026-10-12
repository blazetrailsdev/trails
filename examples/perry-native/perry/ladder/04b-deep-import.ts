// Control for rung 04: the same function, imported from the module that
// defines it instead of through the package barrel. `@blazetrails/activesupport`'s
// entry point re-exports 145 names, so the barrel form pulls the whole package
// into one compilation unit; this form pulls one file's subgraph.
//
// The path reaches into node_modules directly because the package's `exports`
// map publishes no subpath for `inflector`. That is fine for a diagnostic and
// is not a pattern to copy into application code.
// @ts-expect-error — no type declarations are resolved through this raw path
import { camelize } from "../../node_modules/@blazetrails/activesupport/dist/inflector.js";
console.log(`[04b] ${camelize("trail_name") as string}`);
