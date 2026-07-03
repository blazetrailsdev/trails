// Regression guard for the adapter-graph circular-init TDZ crash.
//
// `AbstractAdapter` used to apply its mixin wiring
// (`include(AbstractAdapter, SchemaStatements)`, …) at module-evaluation time.
// When the graph was first entered through `SchemaStatements` (e.g.
// SchemaStatements → schema-dumper → base → back into abstract-adapter), that
// top-level code re-referenced the mixin classes while they were still in their
// temporal dead zone, crashing with
// `ReferenceError: Cannot access 'SchemaStatements' before initialization`.
//
// This test lives in the `other` vitest project (which does NOT preload the
// ActiveRecord adapter graph via setupFiles), so its import evaluates the graph
// fresh with `SchemaStatements` as the entry point — the exact condition that
// reproduced the crash. If the module-level wiring is ever restored, importing
// this file fails at collection time.
//
// The import below is deliberately the first thing this module touches.
import { SchemaStatements } from "../../packages/activerecord/src/connection-adapters/abstract/schema-statements.js";
import { describe, it, expect } from "vitest";

describe("adapter-graph circular-init", () => {
  it("imports SchemaStatements (value) without a TDZ ReferenceError", () => {
    expect(typeof SchemaStatements).toBe("function");
  });
});
