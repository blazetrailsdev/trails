/**
 * Covers the adapter-aware string-quoting dispatch in JoinDependency
 * (polymorphic source_type / STI IN-list / has_many :through polymorphic
 * source_type predicates). Mirrors the spirit of Rails'
 * `connection.quote` usage in `ThroughReflection` — verifies the literal
 * routes through the active adapter's `quote()` rather than a
 * hand-rolled escape.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { ConnectionNotDefined } from "../errors.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";

function stubConnection(model: typeof Base, conn: Partial<DatabaseAdapter> | (() => never)) {
  Object.defineProperty(model, "connection", {
    value: typeof conn === "function" ? conn : () => conn,
    configurable: true,
    writable: true,
  });
}

describe("JoinDependency adapter-aware quoting", () => {
  let adapter: DatabaseAdapter;

  class Owner extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class Asset extends Base {
    static {
      this.attribute("owner_id", "integer");
      this.attribute("owner_type", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    Owner.adapter = adapter;
    Asset.adapter = adapter;
    (Owner as any)._associations = [];
    (Asset as any)._associations = [];
    registerModel(Owner);
    registerModel(Asset);
  });

  it("routes polymorphic :as type literal through the adapter's quote()", () => {
    const calls: unknown[] = [];
    stubConnection(Owner, { quote: (v: unknown) => (calls.push(v), `<<${String(v)}>>`) } as any);

    Associations.hasMany.call(Owner, "assets", { className: "Asset", as: "owner" });

    const jd = new JoinDependency(Owner);
    const node = jd.addAssociation("assets");
    expect(node).not.toBeNull();
    expect(node!.joinSql).toContain(`"owner_type" = <<Owner>>`);
    expect(calls).toContain("Owner");
  });

  it("routes STI subclass IN-list through the adapter's quote()", () => {
    class Vehicle extends Base {
      static {
        this.attribute("type", "string");
        this.attribute("owner_id", "integer");
      }
    }
    class Car extends Vehicle {}
    enableSti(Vehicle);
    registerSubclass(Car);
    Vehicle.adapter = adapter;
    Car.adapter = adapter;
    (Vehicle as any)._associations = [];
    (Car as any)._associations = [];
    registerModel(Vehicle);
    registerModel(Car);

    const calls: unknown[] = [];
    stubConnection(Owner, { quote: (v: unknown) => (calls.push(v), `<<${String(v)}>>`) } as any);

    Associations.hasMany.call(Owner, "cars", { className: "Car", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner);
    const node = jd.addAssociation("cars");
    expect(node).not.toBeNull();
    expect(node!.joinSql).toContain(`"type" IN (<<Car>>)`);
    expect(calls).toContain("Car");
  });

  it("falls back to the abstract quote when no pool is wired", () => {
    stubConnection(Owner, () => {
      throw new ConnectionNotDefined("no pool");
    });
    Associations.hasMany.call(Owner, "assets", { className: "Asset", as: "owner" });
    const jd = new JoinDependency(Owner);
    const node = jd.addAssociation("assets");
    expect(node).not.toBeNull();
    // Abstract quote emits the same `'Owner'` literal as the inlined escape did.
    expect(node!.joinSql).toContain(`"owner_type" = 'Owner'`);
  });

  it("propagates non-ConnectionNotDefined errors from connection()", () => {
    stubConnection(Owner, () => {
      throw new Error("pool exhausted");
    });
    expect(() => new JoinDependency(Owner)).toThrow("pool exhausted");
  });
});
