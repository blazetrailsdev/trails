/**
 * trails-only invariants for the single STI hydration path in
 * `Base._instantiate`. See inheritance.test.ts for the Rails-mirrored suite.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Client } from "./test-helpers/models/company.js";
import { Author } from "./test-helpers/models/author.js";

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

describe("descends_from_active_record? column test", () => {
  fixtures(["authors"]);

  // Rails asks `columns_hash.include?(inheritance_column)`
  // (inheritance.rb:82-88) — real column metadata. A declared attribute named
  // `type` with no backing column is not an inheritance column, so a subclass
  // carrying one still descends from ActiveRecord::Base rather than reading as
  // an STI subclass.
  it("a virtual type attribute is not an inheritance column", () => {
    class VirtualTypeAuthor extends Author {
      static {
        this.attribute("type", "string", { virtual: true } as never);
      }
    }

    expect(VirtualTypeAuthor.isDescendsFromActiveRecord()).toBe(true);
  });
});
