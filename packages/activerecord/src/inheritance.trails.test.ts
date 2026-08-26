/**
 * trails-only invariants for the single STI hydration path in
 * `Base._instantiate`. See inheritance.test.ts for the Rails-mirrored suite.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Client } from "./test-helpers/models/company.js";
import { isFinderNeedsTypeCondition } from "./inheritance.js";
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
        this.attribute("type", "string");
      }
    }

    expect(VirtualTypeAuthor.isDescendsFromActiveRecord()).toBe(true);
  });
});

describe("ensure_proper_type on an unreflected subclass", () => {
  fixtures([]);

  // `ensure_proper_type` writes the STI type unconditionally once
  // `finder_needs_type_condition?` says so (inheritance.rb:331-336) — no
  // membership test on the inheritance column. trails carried one because a
  // strict `_writeAttribute` raises on an attribute the model does not know and
  // trails reflects lazily; construction now resolves the column itself, so the
  // guard is gone and a subclass that has never been queried still gets its type.
  it("writes the sti name without a membership guard", () => {
    class ColdClient extends Client {}

    expect(isFinderNeedsTypeCondition(ColdClient)).toBe(true);
    expect(new ColdClient({}).type).toBe("ColdClient");
  });
});

describe("descends_from_active_record? on a cold model", () => {
  // No `fixtures` on purpose: the cold window is the one where nothing has
  // leased a connection, so there is no warm `columns_hash` to read and Rails'
  // `columns_hash.include?(inheritance_column)` (inheritance.rb:82-88) has to
  // load the schema rather than answer from `attribute_types`, which counts the
  // virtual `type` and misreads the model as an STI subclass.
  it("a virtual type attribute on an unreflected model is not an inheritance column", () => {
    class ColdVirtualTypeAuthor extends Author {
      static {
        this.attribute("type", "string");
      }
    }

    expect(ColdVirtualTypeAuthor.isDescendsFromActiveRecord()).toBe(true);
  });
});

/**
 * `Inheritance#initialize_dup` (inheritance.rb:343-346) calls `super` and then
 * `ensure_proper_type`, so the copy's inheritance column is written from the
 * class rather than merely inherited from the deep-dup'd attributes.
 */
describe("initialize_dup ensure_proper_type", () => {
  fixtures(["companies"]);

  it("rewrites the inheritance column on the copy", async () => {
    const client = await Client.create({ name: "Acme" });
    client.writeAttribute("type", "Company");
    expect(client.readAttribute("type")).toBe("Company");

    const duped = client.dup();

    expect(duped.readAttribute("type")).toBe("Client");
  });
});
