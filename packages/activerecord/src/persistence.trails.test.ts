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
import { RecordInvalid } from "./index.js";
import { fixtures, setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { repairValidations } from "./test-helpers/repair-validations.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { Developer as CanonicalDeveloper } from "./test-helpers/models/developer.js";
import { Item as CanonicalItem } from "./test-helpers/models/item.js";

describe("PersistenceTest (trails)", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  const Topic = CanonicalTopic;
  fixtures(["topics", "developers"], { schema: canonicalSchema });

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
  setupFixtures();
  useHandlerTransactionalFixtures();
  fixtures(["items"], { schema: canonicalSchema });

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
