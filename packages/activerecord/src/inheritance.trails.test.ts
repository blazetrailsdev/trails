/**
 * trails-only invariants for the single STI hydration path in
 * `Base._instantiate`. See inheritance.test.ts for the Rails-mirrored suite.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-helpers/fixtures.js";
import { Client } from "./test-helpers/models/company.js";

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
