// Zero-import slot for the `Trails` constant, per CLAUDE.md's "Call-time
// constant resolution (Ruby autoload → the zero-import slot)". Ruby resolves
// `Rails` inside `LazyRouteSet`'s method bodies when they run
// (`railties/lib/rails/engine/lazy_route_set.rb:12-104`); an ESM import of
// `rails.js` from `lazy-route-set.ts` would instead close the cycle
// `engine.ts → lazy-route-set.ts → rails.ts → application.ts → engine.ts`,
// whose `class Application extends Engine` edge puts `Engine` in TDZ.
//
// This module imports nothing at runtime, so it cannot join a cycle.
import type { Trails as TrailsClass } from "./rails.js";

export let _Trails: typeof TrailsClass | undefined;

/** @internal Called by `rails.ts` at the bottom of its own module body. */
export function _setTrails(value: typeof TrailsClass): void {
  _Trails = value;
}
