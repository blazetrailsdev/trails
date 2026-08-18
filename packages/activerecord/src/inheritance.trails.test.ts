/**
 * trails-only invariants for the single STI hydration path in
 * `Base._instantiate`. See inheritance.test.ts for the Rails-mirrored suite.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { SubclassNotFound } from "./errors.js";
import { Client, VerySpecialClient } from "./test-helpers/models/company.js";

describe("_instantiate STI dispatch", () => {
  fixtures([]);

  // `discriminateClassForRecord` runs against `this`, as in Rails, not
  // `base_class`. Discriminating from the base resolves a row with no
  // inheritance column back to the base, which under the class-identity guard
  // would demote the receiver: `Client.select("id")` would hydrate `Company`
  // instances.
  it("keeps a row without the inheritance column on the receiver subclass", () => {
    const record = Client._instantiate({ id: "7", name: "Acme" });

    expect(record).toBeInstanceOf(Client);
  });
});

describe("new() STI dispatch gate", () => {
  // The gate short-circuited on `!classHasAttribute && descendants.length === 0`,
  // which swallowed an STI *leaf* whose `type` column had not reflected yet and
  // which tracks no descendants of its own: it built as-is (and then failed as an
  // unknown attribute) where Rails' `_has_attribute?(inheritance_column)` gate
  // (inheritance.rb:55, subclass_from_attributes) reaches find_sti_class and
  // raises. No fixtures/schema load here on purpose — the reflection has to be
  // cold for the leaf to be one.
  it("raises SubclassNotFound for a bad type on a cold STI leaf", () => {
    expect(() => VerySpecialClient.new({ type: "InvalidType" })).toThrow(SubclassNotFound);
  });
});
