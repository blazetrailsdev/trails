/**
 * HABTM Slot E — Polymorphic + STI through.
 *
 * Pins the contract for two intersecting through-association shapes
 * that Rails exercises but our previous regression coverage skipped:
 *
 *   - `has_many :through` whose source reflection is a polymorphic
 *     belongs_to, disambiguated by `source_type:` ("polymorphic
 *     has_many through"). The fixture layers this on top of a
 *     nested through (Hotel → Departments → Chefs), so `loadHasMany`
 *     routes through `loadHasManyThrough`'s walker rather than the
 *     final-step JOIN/AssociationScope path. Both that walker and
 *     the `includes()` preloader must filter through-records by the
 *     polymorphic discriminator (`*_type`) and only materialize the
 *     matching target class.
 *   - The same chain with an STI subclass as the polymorphic target —
 *     the source-type filter is applied at the through step *and*
 *     STI promotion happens at the leaf so subclass rows materialize
 *     with the correct constructor.
 *   - Two source-typed associations layered on the same intermediate
 *     (`joined_different_table_twice` in Rails) load disjoint sets.
 *
 * Also pins HMT Slot D's punted intermediate-table `where(...)`
 * contract: filtering the outer relation while preloading a
 * polymorphic-through must preserve every preloaded target (no
 * silent drops via JOIN-collapsed cardinality).
 *
 * Mirrors selected scenarios from
 * vendor/rails/activerecord/test/cases/associations/nested_through_associations_test.rb
 *   - test_polymorphic_has_many_through_when_through_association_has_not_loaded
 *   - test_polymorphic_has_many_through_joined_different_table_twice
 *   - test_has_many_through_with_sti_on_through_reflection (STI variant)
 *   - test_has_many_through_reset_source_reflection_after_loading_is_complete
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, registerSubclass, enableSti } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";

const TEST_SCHEMA: Schema = {
  ps_hotels: { name: "string" },
  ps_departments: { ps_hotel_id: "integer", name: "string" },
  ps_chefs: {
    ps_department_id: "integer",
    employable_id: "integer",
    employable_type: "string",
  },
  ps_cake_designers: { name: "string", type: "string" },
  ps_drink_designers: { name: "string" },
};

async function freshAdapter(): Promise<DatabaseAdapter> {
  const adapter = createTestAdapter();
  await defineSchema(adapter, TEST_SCHEMA);
  return adapter;
}

describe("HABTM Slot E — polymorphic + STI through", () => {
  let adapter: DatabaseAdapter;

  class PsHotel extends Base {
    static {
      this._tableName = "ps_hotels";
      this.attribute("name", "string");
    }
  }
  class PsDepartment extends Base {
    static {
      this._tableName = "ps_departments";
      this.attribute("ps_hotel_id", "integer");
      this.attribute("name", "string");
    }
  }
  class PsChef extends Base {
    static {
      this._tableName = "ps_chefs";
      this.attribute("ps_department_id", "integer");
      this.attribute("employable_id", "integer");
      this.attribute("employable_type", "string");
    }
  }
  class PsCakeDesigner extends Base {
    static {
      this._tableName = "ps_cake_designers";
      this.attribute("name", "string");
      this.attribute("type", "string");
    }
  }
  class PsDrinkDesigner extends Base {
    static {
      this._tableName = "ps_drink_designers";
      this.attribute("name", "string");
    }
  }
  // STI subclass of a polymorphic target: still discriminated by
  // employable_type = "PsCakeDesigner" on the through row, then STI
  // promoted on the leaf row's own `type` column.
  class PsSpecialCakeDesigner extends PsCakeDesigner {}
  enableSti(PsCakeDesigner);
  registerSubclass(PsSpecialCakeDesigner);

  beforeEach(async () => {
    adapter = await freshAdapter();
    PsHotel.adapter = adapter;
    PsDepartment.adapter = adapter;
    PsChef.adapter = adapter;
    PsCakeDesigner.adapter = adapter;
    PsDrinkDesigner.adapter = adapter;
    PsSpecialCakeDesigner.adapter = adapter;
    registerModel("PsHotel", PsHotel);
    registerModel("PsDepartment", PsDepartment);
    registerModel("PsChef", PsChef);
    registerModel("PsCakeDesigner", PsCakeDesigner);
    registerModel("PsDrinkDesigner", PsDrinkDesigner);
    registerModel("PsSpecialCakeDesigner", PsSpecialCakeDesigner);
    (PsHotel as any)._associations = [];
    (PsDepartment as any)._associations = [];
    (PsChef as any)._associations = [];

    Associations.hasMany.call(PsHotel, "psDepartments", {
      className: "PsDepartment",
      foreignKey: "ps_hotel_id",
    });
    Associations.hasMany.call(PsDepartment, "psChefs", {
      className: "PsChef",
      foreignKey: "ps_department_id",
    });
    Associations.belongsTo.call(PsChef, "employable", {
      polymorphic: true,
      foreignKey: "employable_id",
    });
    // Nested through: PsHotel → psDepartments → psChefs.
    Associations.hasMany.call(PsHotel, "psChefs", {
      className: "PsChef",
      through: "psDepartments",
      source: "psChefs",
    });
    // Polymorphic+sourceType source on top of the nested through.
    Associations.hasMany.call(PsHotel, "cakeDesigners", {
      className: "PsCakeDesigner",
      through: "psChefs",
      source: "employable",
      sourceType: "PsCakeDesigner",
    });
    Associations.hasMany.call(PsHotel, "drinkDesigners", {
      className: "PsDrinkDesigner",
      through: "psChefs",
      source: "employable",
      sourceType: "PsDrinkDesigner",
    });
  });

  async function seed() {
    const hotel = await PsHotel.create({ name: "h" });
    const dept = (await PsDepartment.create({
      ps_hotel_id: hotel.id,
      name: "d",
    })) as any;
    const cake1 = (await PsCakeDesigner.create({ name: "cake1" })) as any;
    const cake2 = (await PsCakeDesigner.create({ name: "cake2" })) as any;
    // strayCake has no chef row pointing at it. Burn enough drink
    // rows to bump the per-table sequence so the actual drink-type
    // chef points at a drink whose id collides with strayCake (=3).
    // If the source_type filter is missing, the unfiltered through
    // walk hands strayCake.id to the cake-table load and strayCake
    // leaks into the cakeDesigners result.
    const strayCake = (await PsCakeDesigner.create({ name: "stray" })) as any;
    await PsDrinkDesigner.create({ name: "filler1" });
    await PsDrinkDesigner.create({ name: "filler2" });
    const drink = (await PsDrinkDesigner.create({ name: "drink" })) as any;
    expect(drink.id).toBe(strayCake.id);

    await PsChef.create({
      ps_department_id: dept.id,
      employable_id: cake1.id,
      employable_type: "PsCakeDesigner",
    });
    await PsChef.create({
      ps_department_id: dept.id,
      employable_id: cake2.id,
      employable_type: "PsCakeDesigner",
    });
    await PsChef.create({
      ps_department_id: dept.id,
      employable_id: drink.id,
      employable_type: "PsDrinkDesigner",
    });

    return { hotel, dept, cake1, cake2, strayCake, drink };
  }

  it("loadHasManyThrough filters polymorphic-through by source_type and excludes the wrong-type cake row sharing the drink's id", async () => {
    const { hotel, cake1, cake2, strayCake } = await seed();
    const reflection = (PsHotel as any)._reflectOnAssociation("cakeDesigners");
    const designers = await loadHasMany(hotel, "cakeDesigners", reflection.options);
    expect(designers.map((d: any) => d.id).sort()).toEqual([cake1.id, cake2.id].sort());
    // strayCake shares an id with the drink-type chef row's
    // employable_id; if the source_type filter were absent the
    // through walk would pass that id to the cake-table load and
    // strayCake would appear here.
    expect(designers.find((d: any) => d.id === strayCake.id)).toBeUndefined();
    expect(designers.every((d: any) => d instanceof PsCakeDesigner)).toBe(true);
  });

  it("includes() preloads polymorphic-through with source_type into _preloadedAssociations", async () => {
    const { hotel, cake1, cake2 } = await seed();
    const loaded = (await PsHotel.all().includes("cakeDesigners").toArray()) as any[];
    const h = loaded.find((row) => row.id === hotel.id) as any;
    const preloaded = h._preloadedAssociations?.get("cakeDesigners") as any[];
    expect(preloaded).toBeDefined();
    expect(preloaded.map((d: any) => d.id).sort()).toEqual([cake1.id, cake2.id].sort());
    expect(preloaded.every((d: any) => d instanceof PsCakeDesigner)).toBe(true);
  });

  it("two source-typed associations on the same intermediate load disjoint sets (joined_different_table_twice)", async () => {
    const { hotel, cake1, cake2, drink } = await seed();
    const cakeRefl = (PsHotel as any)._reflectOnAssociation("cakeDesigners");
    const drinkRefl = (PsHotel as any)._reflectOnAssociation("drinkDesigners");
    const cakes = await loadHasMany(hotel, "cakeDesigners", cakeRefl.options);
    const drinks = await loadHasMany(hotel, "drinkDesigners", drinkRefl.options);
    expect(cakes.map((d: any) => d.id).sort()).toEqual([cake1.id, cake2.id].sort());
    expect(drinks.map((d: any) => d.id).sort()).toEqual([drink.id].sort());
    // Independent loads on the same through chain don't bleed: each
    // result set is entirely of its declared sourceType class.
    expect(cakes.every((d: any) => d instanceof PsCakeDesigner)).toBe(true);
    expect(drinks.every((d: any) => d instanceof PsDrinkDesigner)).toBe(true);
  });

  it("includes() preloads disjoint source-typed associations from the same intermediate in one outer query", async () => {
    const { hotel, cake1, cake2, drink } = await seed();
    const loaded = (await PsHotel.all()
      .includes("cakeDesigners")
      .includes("drinkDesigners")
      .toArray()) as any[];
    const h = loaded.find((row) => row.id === hotel.id) as any;
    const cakes = h._preloadedAssociations?.get("cakeDesigners") as any[];
    const drinks = h._preloadedAssociations?.get("drinkDesigners") as any[];
    expect(cakes.map((d: any) => d.id).sort()).toEqual([cake1.id, cake2.id].sort());
    expect(drinks.map((d: any) => d.id).sort()).toEqual([drink.id].sort());
    // Class assertions matter: drink.id collides with strayCake.id
    // (per-table sequences plus the seed's drink-row fillers), so a
    // preloader that swapped tables for `drinkDesigners` could
    // still satisfy the id expectation. Pin the constructor on
    // both sides.
    expect(cakes.every((d: any) => d instanceof PsCakeDesigner)).toBe(true);
    expect(drinks.every((d: any) => d instanceof PsDrinkDesigner)).toBe(true);
  });

  it("STI subclass at the polymorphic leaf materializes with the correct constructor under both load paths", async () => {
    const hotel = await PsHotel.create({ name: "sti" });
    const dept = (await PsDepartment.create({
      ps_hotel_id: hotel.id,
      name: "d",
    })) as any;
    const special = (await PsSpecialCakeDesigner.create({
      name: "special",
    })) as any;
    await PsChef.create({
      ps_department_id: dept.id,
      employable_id: special.id,
      // employable_type uses the STI root, mirroring Rails — the STI
      // discriminator on the leaf row promotes to the subclass.
      employable_type: "PsCakeDesigner",
    });

    const reflection = (PsHotel as any)._reflectOnAssociation("cakeDesigners");
    const designers = await loadHasMany(hotel, "cakeDesigners", reflection.options);
    expect(designers.length).toBe(1);
    expect(designers[0].id).toBe(special.id);
    expect(designers[0].constructor).toBe(PsSpecialCakeDesigner);

    const loaded = (await PsHotel.all()
      .includes("cakeDesigners")
      .where({ id: hotel.id })
      .toArray()) as any[];
    const preloaded = loaded[0]._preloadedAssociations?.get("cakeDesigners") as any[];
    expect(preloaded.length).toBe(1);
    expect(preloaded[0].constructor).toBe(PsSpecialCakeDesigner);
  });

  it("includes() + outer where preserves every preloaded polymorphic-through target", async () => {
    const { hotel, cake1, cake2 } = await seed();
    const loaded = (await PsHotel.all()
      .includes("cakeDesigners")
      .where({ id: hotel.id })
      .toArray()) as any[];
    const h = loaded[0] as any;
    const preloaded = h._preloadedAssociations?.get("cakeDesigners") as any[];
    // Filtering the outer relation must not silently drop preloaded
    // targets — a JOIN-collapsed cardinality bug here would surface
    // as 1-of-2 rather than the full set.
    expect(preloaded.map((d: any) => d.id).sort()).toEqual([cake1.id, cake2.id].sort());
  });

  it("repeated preload of the polymorphic source resets the source reflection cleanly between calls", async () => {
    // Rails: test_has_many_through_reset_source_reflection_after_loading_is_complete.
    // Two independent owners preloaded through the same reflection
    // must not leak each other's source records — a cached source
    // reflection state would cause the second owner's preloaded set
    // to contain (or omit) the first owner's targets.
    const { hotel: h1, cake1, cake2 } = await seed();
    const { hotel: h2, cake1: h2cake1, cake2: h2cake2 } = await seed();

    const first = (await PsHotel.all()
      .includes("cakeDesigners")
      .where({ id: h1.id })
      .toArray()) as any[];
    const firstIds = (first[0]._preloadedAssociations?.get("cakeDesigners") as any[])
      .map((d) => d.id)
      .sort();
    expect(firstIds).toEqual([cake1.id, cake2.id].sort());

    // Second preload — independent relation, same reflection. If
    // source-reflection scope/owner state isn't reset after the
    // first preload completes, h2's preloaded set will contain h1's
    // cakes (or miss h2's). Assert h2's exact expected pair so the
    // contract catches both leak directions: stray h1 row and
    // wrong-id substitution (e.g. h2's stray cake).
    const second = (await PsHotel.all()
      .includes("cakeDesigners")
      .where({ id: h2.id })
      .toArray()) as any[];
    const secondIds = (second[0]._preloadedAssociations?.get("cakeDesigners") as any[])
      .map((d) => d.id)
      .sort();
    expect(secondIds).toEqual([h2cake1.id, h2cake2.id].sort());
    expect(secondIds.every((id) => !firstIds.includes(id))).toBe(true);
  });
});
