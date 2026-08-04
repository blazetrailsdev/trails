// `@blazetrails/activesupport/yaml` resolves the optional `yaml` package with a
// top-level `await import(...)` so a missing install fails at the call site
// rather than at link time — incompatible with Rollup's IIFE format, which the
// service-worker bundle needs for `importScripts("/sql-wasm.js")`. In the
// browser bundle `yaml` is always present (it is bundled), so a static
// re-export is equivalent and drops the top-level await.
export { parse, stringify } from "yaml";
