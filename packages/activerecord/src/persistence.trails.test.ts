/**
 * Trails-specific cases relocated out of persistence.test.ts (RFC 0048
 * one-schema convergence). These exercise trails-only extensions with no
 * counterpart in activerecord/test/cases/persistence_test.rb: the array forms
 * of `create`/`create!`/`new`/`build` (Rails ports `create_many`/`build_many`
 * separately), block-yielding on `create`, the `:all`-default and
 * parallel-array forms of class-level `update`, the Base-instance guard on
 * `update`, the `save!` validation-before-destroyed-guard ordering, and the
 * `destroyBy`/`deleteBy` shorthands. Test names are kept verbatim per CLAUDE.md.
 */
import { describe, it, expect } from "vitest";
import { RecordInvalid, registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { repairValidations } from "./cases/validations-repair-helper.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { Developer as CanonicalDeveloper } from "./test-helpers/models/developer.js";
import { Item as CanonicalItem } from "./test-helpers/models/item.js";
import { ClothingItem } from "./test-helpers/models/clothing-item.js";
import { Minimalistic } from "./test-helpers/models/minimalistic.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { captureSql } from "./testing/sql-capture.js";

describe("PersistenceTest (trails)", () => {
  const Topic = CanonicalTopic;
  fixtures(["topics", "developers"]);

  // Rails: Model.update([ids], [attrs]) — parallel arrays, index-aligned.
  it("update with parallel ids + attrs arrays updates each record", async () => {
    const t1 = await Topic.create({ title: "a" });
    const t2 = await Topic.create({ title: "b" });
    const result = await Topic.update([t1.id, t2.id], [{ title: "x" }, { title: "y" }]);
    expect(result).toHaveLength(2);
    expect((await Topic.find(t1.id)).title).toBe("x");
    expect((await Topic.find(t2.id)).title).toBe("y");
  });

  // Rails: Model.update(attrs) — :all-sentinel default applies attrs to every record.
  it("update with just attrs applies to every record in scope (:all default)", async () => {
    await Topic.create({ title: "a" });
    await Topic.create({ title: "b" });
    const result = await Topic.update({ title: "same" });
    const all = await Topic.all();
    expect(result).toHaveLength(all.length);
    expect(all.every((t) => t.title === "same")).toBe(true);
  });

  // Rails: Base.create([{...}, {...}]) recurses and returns an array of
  // persisted records. Same for new() and createBang().
  it("create with an array recurses and returns an array of records", async () => {
    const result = await Topic.create([{ title: "a" }, { title: "b" }]);
    expect(result).toHaveLength(2);
    expect(result[0].isPersisted()).toBe(true);
    expect(result.map((t) => t.title)).toEqual(["a", "b"]);
  });

  it("createBang with an array recurses and returns an array of records", async () => {
    const result = await Topic.createBang([{ title: "a" }, { title: "b" }]);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.isPersisted())).toBe(true);
  });

  // Rails 7.2+: `Base.build` is an alias for `Base.new`.
  it("build is an alias for new and supports array + block", () => {
    const single = Topic.build({ title: "a" }, (r) => {
      r.title = "mutated";
    });
    expect(single.isNewRecord()).toBe(true);
    expect(single.title).toBe("mutated");

    const many = Topic.build([{ title: "b" }, { title: "c" }]);
    expect(many).toHaveLength(2);
    expect(many.every((t) => t.isNewRecord())).toBe(true);
  });

  it("new with an array returns unsaved records", () => {
    const result = Topic.new([{ title: "a" }, { title: "b" }]);
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.isNewRecord())).toBe(true);
  });

  // Rails: Base.create(attrs, &block) yields each record to the block
  // before save, so the block can mutate it.
  it("create yields to block before save", async () => {
    const t = await Topic.create({ title: "a" }, (record) => {
      record.title = "mutated-by-block";
    });
    expect(t.title).toBe("mutated-by-block");
    expect(t.isPersisted()).toBe(true);
    const reloaded = await Topic.find(t.id);
    expect(reloaded.title).toBe("mutated-by-block");
  });

  // Rails: create! stops at the first exception, so records after the
  // failed element are not persisted.
  it("createBang with an array stops at the first invalid record", async () => {
    await repairValidations(Topic, async () => {
      Topic.validatesPresenceOf("title");

      await expect(
        Topic.createBang([{ title: "first" }, { title: "" }, { title: "third" }]),
      ).rejects.toThrow();

      // First element committed before the failure.
      expect(await Topic.all().where({ title: "first" }).exists()).toBe(true);
      // Third element never attempted.
      expect(await Topic.all().where({ title: "third" }).exists()).toBe(false);
    });
  });

  it("create with array yields to block for each record", async () => {
    let calls = 0;
    await Topic.create([{ title: "a" }, { title: "b" }], () => {
      calls++;
    });
    expect(calls).toBe(2);
  });

  // Rails: passing an AR instance raises ArgumentError.
  it("update rejects a Base instance", async () => {
    const t = await Topic.create({ title: "a" });
    // Cast the static to a loose signature to bypass the overloads — we're
    // verifying the runtime guard rejects a Base instance, not a supported form.
    const update = Topic.update as (ids: unknown, attrs: unknown) => Promise<unknown>;
    await expect(update(t, { title: "x" })).rejects.toThrow(/ActiveRecord::Base/);
  });

  // Mirrors the Rails module layering: ActiveRecord::Validations#save! runs
  // perform_validations before super → Persistence#create_or_update (where the
  // destroyed guard lives). A record that is both destroyed and invalid must
  // therefore raise RecordInvalid (validations first), not the
  // RecordNotSaved("Failed to save the record") the destroyed guard would yield.
  it("save! runs validations before the destroyed guard", async () => {
    const developer = CanonicalDeveloper.new({ name: "DC", salary: 1_000_000 });
    (developer as unknown as { _destroyed: boolean })._destroyed = true;
    await expect(developer.saveBang()).rejects.toThrow(RecordInvalid);
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["items"]);

  const Item = CanonicalItem;

  it("destroyBy destroys matching records with callbacks", async () => {
    await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    await Item.create({ name: "A" });

    const destroyed = await Item.destroyBy({ name: "A" });
    expect(destroyed).toHaveLength(2);
    expect(await Item.where({ name: "A" }).count()).toBe(0);
    expect(await Item.where({ name: "B" }).count()).toBe(1);
  });

  it("deleteBy deletes matching records without callbacks", async () => {
    await Item.create({ name: "A" });
    await Item.create({ name: "B" });

    const count = await Item.deleteBy({ name: "A" });
    expect(count).toBe(1);
    expect(await Item.where({ name: "A" }).count()).toBe(0);
    expect(await Item.where({ name: "B" }).count()).toBe(1);
  });
});

describe("PersistenceTest (trails)", () => {
  const { clothingItems } = fixtures(["clothingItems"]);

  // Regression guard: like save/delete, `updateColumns` must locate the row via
  // `_query_constraints_hash` (Rails persistence.rb:615-624/852-858), so a model
  // declaring `query_constraints` updates by those columns rather than the
  // primary key alone. `ClothingItem` declares `query_constraints :clothing_type,
  // :color`.
  it("updateColumns targets query_constraints columns in the WHERE", async () => {
    const clothingItem = clothingItems("green_t_shirt");
    const sqls = await captureSql(async () => {
      await clothingItem.updateColumns({ description: "Lovely green t-shirt" });
    });
    const sql = sqls.find((s) => /^UPDATE/.test(s.trimStart())) ?? "";
    expect(sql).toMatch(/WHERE .*clothing_type/);
    expect(sql).toMatch(/WHERE .*color/);

    const reloaded = await ClothingItem.findBy({ id: clothingItem.id });
    expect(reloaded?.description).toBe("Lovely green t-shirt");
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["topics"]);

  // Trails-only edge with no Rails counterpart (Rails keys attribute methods
  // per-class off the class's own `table_name`, model_schema.rb): the residual
  // case PR #4680 left uncovered. A non-STI subclass that overrides
  // `_tableName` AND declares an `attribute()` before its first reflection
  // forks its own `_attributeDefinitions`, copying the ancestor's foreign
  // schema defs. `ensureSchemaLoaded` must still reflect the subclass's own
  // table rather than trusting those copied defs and silently dropping writes.
  // Mirrors `persist inherited class with different table name` (the Rails
  // test in persistence.test.ts) plus a predeclared virtual attribute.
  it("persist inherited class with different table name and predeclared attribute", async () => {
    // Reflect the ancestor first so its `_attributeDefinitions` holds
    // schema-sourced defs for the `minimalistics` table — the state the
    // subclass's map is forked from.
    await Minimalistic.create({});

    class MinimalisticAircraft extends Minimalistic {
      static _tableName = "aircraft";
      static {
        this.attribute("wingspan", "integer", { virtual: true });
      }
    }
    registerModel(MinimalisticAircraft);

    // Evict `aircraft` from the adapter schema cache so the sync reconcile path
    // cannot find its columns — the cold-cache condition under which the bug
    // bites (otherwise a warm cross-file cache masks it). Only clears the
    // sibling `Aircraft`'s reflection, not the subclass's copied foreign defs.
    Aircraft.resetColumnInformation();

    const before = (await Aircraft.count()) as number;
    const aircraft = (await MinimalisticAircraft.create({ name: "Wright Flyer" })) as unknown as {
      name: string | null;
      wingspan: unknown;
      save: () => Promise<unknown>;
    };
    aircraft.name = "Wright Glider";
    await aircraft.save();
    expect(await Aircraft.count()).toBe(before + 1);

    // The subclass reflected its own `aircraft` table: the write persisted
    // (without the fix, `reconcileVirtualAttributes` never learns `name` and the
    // insert silently drops it, reading back `null`).
    const last = (await Aircraft.last()) as unknown as { name: string | null } | null;
    expect(last?.name).toBe("Wright Glider");
    // The foreign `expires_at` column (copied from the `minimalistics` map) is
    // gone, and the predeclared virtual attribute survives the reflection.
    expect(MinimalisticAircraft.columnNames()).not.toContain("expires_at");
    expect(MinimalisticAircraft.columnNames()).toContain("name");
    expect(aircraft.wingspan).toBeNull();
  });
});

describe("PersistenceTest (trails)", () => {
  fixtures(["companies"]);

  // Rails' becomes allocates with `klass.allocate` (persistence.rb:487), which
  // never enters Inheritance::ClassMethods#new — so the abstract-class / Base
  // guard `new` enforces (inheritance.rb:57) must not fire for becomes().
  it("becomes bypasses the Base abstract-instantiation guard", async () => {
    const { Base } = await import("./index.js");
    const { Company } = await import("./test-helpers/models/company.js");
    const company = await Company.first();
    const asBase = company!.becomes(Base as never);
    expect(asBase).toBeInstanceOf(Base);
    expect((asBase as unknown as { id: unknown }).id).toBe(company!.id);
  });
});
