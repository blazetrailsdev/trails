import { describe, it, expect } from "vitest";
import {
  loadSchemaOverrides,
  registerLoadSchemaOverride,
  type LoadSchemaOverride,
} from "./load-schema-overrides-slot.js";
import { loadSchemaBang } from "./model-schema.js";
import "./counter-cache.js";
import "./encryption/encryptable-record.js";

/**
 * TS-only: Rails gets the ordering from `include` (base.rb:309 CounterCache,
 * :313 Encryption::EncryptableRecord), so a Ruby test would have nothing to
 * assert. trails rebuilds the chain by hand, so the order and the `super`
 * wiring are worth pinning.
 */
describe("load_schema! super chain", () => {
  it("registers CounterCache and EncryptableRecord at their include positions", () => {
    expect(loadSchemaOverrides.map((entry) => entry.includeOrder)).toEqual([309, 313]);
  });

  it("runs the later-included override first, each reaching the next through super", () => {
    const calls: string[] = [];
    const late: LoadSchemaOverride = function (superFn) {
      calls.push("late");
      superFn();
    };
    const early: LoadSchemaOverride = function (superFn) {
      calls.push("early");
      superFn();
    };
    registerLoadSchemaOverride(9999, late);
    registerLoadSchemaOverride(1, early);

    try {
      const host = { _schemaLoaded: true } as never;
      // `_schemaLoaded` short-circuits the concerns' own bodies; the anchor
      // still throws for a table-less host, which is all we need past the
      // ordering assertion.
      expect(() => loadSchemaBang.call(host)).toThrow();
      expect(calls).toEqual(["late", "early"]);
    } finally {
      loadSchemaOverrides.splice(
        0,
        loadSchemaOverrides.length,
        ...loadSchemaOverrides.filter((e) => e.override !== late && e.override !== early),
      );
    }
  });
});
