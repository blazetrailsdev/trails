// Regression guard for the relation<->associations circular-init TDZ crash.
//
// `associations.ts` used to force-load two `Relation` SUBCLASSES at module
// scope (`associations/collection-proxy.js`, `association-relation.js`, and the
// `disable-joins-association-scope.js` that reaches a third). Since
// `relation.ts` reaches `associations.ts` (relation -> insert-all ->
// model-schema -> associations), entering the graph at `relation.ts` re-entered
// it while `Relation` was still in its temporal dead zone, crashing with
// `ReferenceError: Cannot access 'Relation' before initialization`. Those three
// now load through the zero-import slots (`associations/collection-proxy-slot.ts`,
// `associations/_scope-slots.ts`) the way Zeitwerk autoloads them in Ruby — see
// CLAUDE.md, "Call-time constant resolution (Ruby autoload → the zero-import
// slot)".
//
// Like the adapter-graph guard next door, this lives in the `other` vitest
// project, which does NOT preload the ActiveRecord graph via setupFiles, so the
// import below really is the entry module.
//
// The import is deliberately the first thing this module touches.
import { Relation } from "../../packages/activerecord/src/relation.js";
import { describe, it, expect } from "vitest";

describe("relation entry circular-init", () => {
  it("imports Relation (value) without a TDZ ReferenceError", () => {
    expect(typeof Relation).toBe("function");
  });
});
