/**
 * Trails-only surface: removal of a has_one record displaced by the
 * *synchronous* build path.
 *
 * Rails' `HasOneAssociation#set_new_record` -> `replace(record, false)` runs
 * `remove_target!` inline (has_one_association.rb:68-69, 91-92), including the
 * persisted nullify `target.save` at :108. A synchronous JS builder cannot
 * await that write, so `setNewRecord` performs only the in-memory half; every
 * caller that can displace a persisted record issues the DB half itself. The
 * `build#{Name}` / `create#{Name}` accessors use `detachDisplacedTarget`. For
 * `assoc.build()`, which nested attributes calls directly, the nested-attributes
 * writer uses `detachDisplacedRecord` — starting the removal inline at
 * assignment and awaiting it in its `save` wrapper before the replacement is
 * inserted. A *direct* `record.association(name).build(...)` has no such
 * wrapper, so `HasOneAssociation#build` runs the removal itself and returns the
 * record wrapped in that promise for the caller to `await`.
 *
 * Rails' own `test_should_replace_an_existing_record_if_there_is_no_id`
 * (nested_attributes_test.rb:288) asserts only in-memory state and never saves
 * the owner, so it does not cover the displaced row — hence this trails-only
 * guard rather than a change to the mirrored test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, type Base } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";

describe("has_one displacement via the synchronous build path", () => {
  fixtures(["pirates", "ships"]);

  beforeAll(() => {
    registerModel(Pirate);
    registerModel(Ship);
  });

  it("nullifies the displaced row when nested attributes replace a loaded child", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;

    // Load the association so `setNewRecord` sees a loaded, persisted target —
    // the case where Rails' `remove_target!` has a row to nullify.
    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
      name: "Davy Jones Gold Dagger",
    };
    await pirate.save();

    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(null);
  });

  it("nullifies the displaced row when association(name).build replaces a loaded child", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;

    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    const assoc = (
      pirate as unknown as { association(n: string): { build(a: object): unknown } }
    ).association("ship");
    const built = (await assoc.build({ name: "Davy Jones Gold Dagger" })) as Base;

    expect((built as unknown as { name: string }).name).toBe("Davy Jones Gold Dagger");
    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(null);
  });

  it("nullifies the displaced row when association(name).build replaces an unloaded child", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;

    // Never load the association: Rails' `replace` guard is `return target
    // unless load_target || record`, whose left operand always runs, so the
    // build discovers the row itself.
    const refetched = (await Pirate.find((pirate as unknown as { id: number }).id)) as Base;
    const assoc = (
      refetched as unknown as { association(n: string): { build(a: object): unknown } }
    ).association("ship");
    const built = (await assoc.build({ name: "Davy Jones Gold Dagger" })) as Base;

    expect((built as unknown as { name: string }).name).toBe("Davy Jones Gold Dagger");
    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(null);
  });

  it("raises from the record construction before issuing the displacement query", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    });

    const refetched = (await Pirate.find((pirate as unknown as { id: number }).id)) as Base;
    const assoc = (
      refetched as unknown as { association(n: string): { build(a: object): unknown } }
    ).association("ship");

    // Rails is `build_record(...)` then `set_new_record` → `load_target`, so a
    // bad attribute raises before anything is queried or displaced. A
    // synchronous throw (not a rejected promise) is what proves the ordering.
    expect(() => assoc.build({ bogus_attribute: 1 })).toThrow();
  });

  it("returns the built record synchronously when no query would run", async () => {
    // A new-record owner keys no row, so Rails' `find_target?` is false and
    // `load_target` queries nothing — the build stays fully in memory.
    const pirate = new (Pirate as unknown as new () => Base)();
    const assoc = (
      pirate as unknown as { association(n: string): { build(a: object): unknown } }
    ).association("ship");

    const built = assoc.build({ name: "Black Pearl" });

    expect(built).not.toBeInstanceOf(Promise);
    expect((built as { name: string }).name).toBe("Black Pearl");
  });
});
