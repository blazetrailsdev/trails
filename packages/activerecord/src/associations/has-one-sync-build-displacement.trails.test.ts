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
 * writer calls the same method — starting the removal inline at
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
import { registerModel, RecordNotSaved, type Base } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";
import { ExclusivelyDependentFirm } from "../test-helpers/models/company.js";

describe("has_one displacement via the synchronous build path", () => {
  fixtures(["pirates", "ships", "companies", "accounts"]);

  beforeAll(() => {
    registerModel(Pirate);
    registerModel(Ship);
    registerModel(ExclusivelyDependentFirm);
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

  it("nullifies the displaced row when nested attributes replace an unloaded child", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;

    // Never load the association: Rails' `build_#{name}` runs `load_target`
    // regardless, so the writer must discover and detach the row itself.
    const refetched = (await Pirate.find((pirate as unknown as { id: number }).id)) as Base;
    (refetched as unknown as { shipAttributes: unknown }).shipAttributes = {
      name: "Davy Jones Gold Dagger",
    };
    await refetched.save();

    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(null);
  });

  it("awaits the unloaded displacement removal from the awaitable writer", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;

    const refetched = (await Pirate.find((pirate as unknown as { id: number }).id)) as Base;
    await (
      refetched as unknown as { setShipAttributes(a: object): Promise<void> }
    ).setShipAttributes({ name: "Davy Jones Gold Dagger" });

    // The awaitable writer drains the removal, so the row is detached before
    // the owner is ever saved — Rails' assignment-time timing.
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

  it("issues no displacement query when the nested-attributes build raises", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;

    const refetched = (await Pirate.find((pirate as unknown as { id: number }).id)) as Base;
    const assoc = refetched.association("ship") as unknown as { buildRecord(a: object): unknown };
    // A pure ordering guard, not user-visible behavior: `buildRecord` is stubbed
    // because the production path has no reachable raise left to provoke —
    // `assertNestedAttributesAreKnown` pre-empts the unknown-attribute one, and
    // the post-`build_record` raises Rails *does* query before are unreachable
    // here (see `prepareDetachDisplacedForSyncBuild`). It pins that the query is
    // issued downstream of the construction, so a future raise added to
    // `build_record` cannot regress the order.
    assoc.buildRecord = () => {
      throw new Error("build exploded");
    };

    expect(() => {
      (refetched as unknown as { shipAttributes: unknown }).shipAttributes = {
        name: "Davy Jones Gold Dagger",
      };
    }).toThrow("build exploded");

    // Rails is `build_record(...)` then `set_new_record` → `load_target`, so a
    // raising build leaves the row untouched and nothing parked to drain.
    expect(
      (refetched as unknown as { _pendingDisplacedRemovals?: unknown[] })
        ._pendingDisplacedRemovals ?? [],
    ).toHaveLength(0);
    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(
      (pirate as unknown as { id: number }).id,
    );
  });

  it("leaves the displaced record cached when its removal fails", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    });

    const displaced = (await (pirate as unknown as { ship: Promise<Base | null> }).ship) as Base;
    // An invalid displaced record makes `remove_target!`'s nullify save return
    // false, which raises RecordNotSaved (has_one_association.rb:102-108).
    (displaced as unknown as { name: string | null }).name = null;

    await expect(
      (pirate as unknown as { buildShip(a: object): Promise<Base> }).buildShip({
        name: "Davy Jones Gold Dagger",
      }),
    ).rejects.toThrow(RecordNotSaved);

    // Rails reaches `self.target = record` only after the transaction block, so
    // a raising `remove_target!` leaves the OLD record cached.
    expect(pirate.association("ship").target).toBe(displaced);
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

  it("leaves the displaced record attached when the build raises", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;
    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    // Rails runs `build_record` first (singular_association.rb:29-31) and only
    // reaches `remove_target!` from `set_new_record` (has_one_association.rb:69),
    // so a construction error — an invalid STI `type`, `SubclassNotFound` —
    // never detaches anything.
    const assoc = pirate.association("ship") as unknown as {
      buildRecord: () => Base;
      detachDisplacedTarget: () => Promise<void>;
    };
    let detached = false;
    assoc.detachDisplacedTarget = () => {
      detached = true;
      return Promise.resolve();
    };
    assoc.buildRecord = () => {
      throw new Error("build exploded");
    };

    expect(() => {
      (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
        name: "Davy Jones Gold Dagger",
      };
    }).toThrow("build exploded");

    expect(detached).toBe(false);
    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(
      (pirate as unknown as { id: number }).id,
    );
  });

  it("runs remove_target!'s delete arm over an unsaved displaced record", async () => {
    // Rails' `remove_target!` calls `target.delete` unconditionally for
    // `dependent: :delete` (has_one_association.rb:97); only the `:destroy` and
    // nullify arms gate on `target.persisted?`. So a second build over an
    // unsaved in-memory target still runs the delete branch — and
    // `Persistence#delete` marks the record destroyed even with no row
    // (persistence.rb:439-444).
    const firm = new (ExclusivelyDependentFirm as unknown as new () => Base)();
    const assoc = (
      firm as unknown as { association(n: string): { build(a: object): unknown } }
    ).association("account");

    const displaced = assoc.build({ credit_limit: 10 }) as Base;
    await assoc.build({ credit_limit: 20 });

    expect((displaced as unknown as { isDestroyed(): boolean }).isDestroyed()).toBe(true);
  });
});
