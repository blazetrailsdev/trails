/**
 * Trails-only coverage for the `build#{name}` half of Rails'
 * `HasOneAssociation#set_new_record` → `replace(record, false)`
 * (vendor/rails/activerecord/lib/active_record/associations/has_one_association.rb:59-93).
 *
 * The `false` gates only `transaction_if(save)` (:68) and `if save &&
 * !record.save` (:75); `remove_target!` (:69) runs regardless, so building a new
 * has_one over an existing target nullifies the displaced record's foreign key
 * and clears its inverse in memory. Rails has no dedicated test for this — it
 * falls out of `replace` — so the assertions live here rather than in the
 * name-matched has_one_associations_test.rb port.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-helpers/use-fixtures.js";
import type { Base } from "../base.js";
import { Pirate, DestructivePirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import { RecordNotFound } from "../index.js";
import { UnknownAttributeError } from "@blazetrails/activemodel";
import { assertQueriesCount } from "../testing/query-assertions.js";

/** `build#{name}` returns a Promise only on the `load_target` path. */
type ShipBuilder = Pirate & {
  buildShip(attributes: Record<string, unknown>): Ship | Promise<Ship>;
};

const inverseTarget = (ship: Ship): unknown => ship.association("pirate").target;

/** The deferred-removal queue drained by the owner's `autosaveHasOne`. */
const displacedQueue = (owner: Base, name = "ship"): Base[] =>
  (owner.association(name) as unknown as { _displacedRecords: Base[] })._displacedRecords;

describe("HasOneAssociation#setNewRecord displaced removal", () => {
  fixtures(["pirates", "ships", "members", "clubs", "memberships", "memberTypes", "developers"]);

  it("build nullifies the displaced record in memory", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Arrr" })) as ShipBuilder;
    const original = await Ship.create({ name: "Black Pearl", pirate_id: pirate.id });

    const displaced = await pirate.loadHasOne("ship");
    expect(displaced?.id).toBe(original.id);

    await pirate.buildShip({ name: "brand new" });

    expect(displaced?.pirate_id).toBeNull();
    expect(inverseTarget(displaced as Ship)).toBeNull();
  });

  it("build loads an unloaded target before displacing it", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const original = await Ship.create({ name: "Black Pearl", pirate_id: pirate.id });

    // No preceding load: `build#{name}` must issue Rails' leading `load_target`
    // (:62) itself, or the existing row is silently orphaned.
    const found = (await Pirate.find(pirate.id)) as ShipBuilder;
    await found.buildShip({ name: "brand new" });
    await found.save();

    expect((await Ship.find(original.id)).pirate_id).toBeNull();
  });

  it("build over a new-record owner leaves no displaced record", async () => {
    const pirate = Pirate.new({ catchphrase: "Arrr" }) as ShipBuilder;
    const first = await pirate.buildShip({ name: "first" });
    const second = await pirate.buildShip({ name: "second" });

    expect(second.name).toBe("second");
    // `first.pirate_id` is already null here whatever `set_new_record` does —
    // `replace`'s `set_owner_attributes` copied the id-less owner's nil pk into
    // it during the first build — so only the inverse clear is load-bearing.
    expect(inverseTarget(first)).toBeNull();
    expect(displacedQueue(pirate)).toHaveLength(0);
  });

  it("create removes the displaced record without waiting for the owner's save", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Arrr" })) as ShipBuilder;
    const original = await Ship.create({ name: "Black Pearl", pirate_id: pirate.id });
    await pirate.loadHasOne("ship");

    // Unlike the sync `build`, `_create_record` can await, and Rails runs
    // `remove_target!` inline inside it (`set_new_record` after `record.save`,
    // singular_association.rb) — so the row must already be nullified here, with
    // no `pirate.save()`.
    await (
      pirate as unknown as { createShip(a: Record<string, unknown>): Promise<Ship> }
    ).createShip({ name: "brand new" });

    expect((await Ship.find(original.id)).pirate_id).toBeNull();
    // detachDisplacedTarget removed it now, so it must not stay queued for a
    // second removal at the owner's next save.
    expect(displacedQueue(pirate)).toHaveLength(0);
    await pirate.save();
    expect((await Ship.find(original.id)).pirate_id).toBeNull();
  });

  it("build over a loaded dependent destroy target does not re-destroy at save", async () => {
    const pirate = await DestructivePirate.create({ catchphrase: "Arrr" });
    const original = await Ship.create({ name: "Doomed", pirate_id: pirate.id });
    await (
      pirate as unknown as { loadHasOne(n: "dependentShip"): Promise<Ship | null> }
    ).loadHasOne("dependentShip");

    // The build accessor detaches (destroys) the loaded target immediately. The
    // record must not also stay on `_displacedRecords`, or `pirate.save()` would
    // re-enter removeTargetBang(:destroy) on the now-frozen record.
    await (
      pirate as unknown as { buildDependentShip(a: Record<string, unknown>): Promise<Ship> }
    ).buildDependentShip({ name: "replacement" });

    await expect(Ship.find(original.id)).rejects.toThrow(RecordNotFound);
    expect(displacedQueue(pirate, "dependentShip")).toHaveLength(0);
    // The second drain must not throw on the frozen, already-destroyed record.
    await pirate.save();
  });

  it("create loads an unloaded target before displacing it", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const original = await Ship.create({ name: "Black Pearl", pirate_id: pirate.id });

    // No preceding load, and no `build#{name}` accessor to pre-issue the SELECT:
    // `_createRecord` must run Rails' leading `load_target` (:62) itself, or the
    // existing row is silently orphaned. The removal is inline, so no `save()`.
    const found = (await Pirate.find(pirate.id)) as unknown as {
      createShip(a: Record<string, unknown>): Promise<Ship>;
    };
    await found.createShip({ name: "brand new" });

    expect((await Ship.find(original.id)).pirate_id).toBeNull();
  });

  it("create that fails to build the record leaves the displaced record alone", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const original = await Ship.create({ name: "Black Pearl", pirate_id: pirate.id });

    // Rails reaches `remove_target!` only via `set_new_record`, which runs after
    // `build_record` (singular_association.rb) — so a `build_record` that raises
    // removes nothing. The deferred load must not fire here either.
    const found = (await Pirate.find(pirate.id)) as unknown as {
      createShip(a: Record<string, unknown>): Promise<Ship>;
    };
    await expect(found.createShip({ bogus_column: 1 })).rejects.toThrow(UnknownAttributeError);

    expect((await Ship.find(original.id)).pirate_id).toBe(Number(pirate.id));
  });

  it("build over a new-record owner destroys a dependent destroy displaced record", async () => {
    const keeper = await DestructivePirate.create({ catchphrase: "Keeper" });
    const doomed = await Ship.create({ name: "Doomed", pirate_id: keeper.id });

    // `remove_target!`'s `:destroy` arm (:99-103) gates on `target.persisted?`
    // alone — `owner.persisted?` lives only in the else branch (:108) — so a
    // new-record owner still destroys the displaced ship.
    const pirate = DestructivePirate.new({ catchphrase: "Arrr" });
    (pirate as unknown as { dependentShip: Ship | null }).dependentShip = doomed;
    (
      pirate.association("dependentShip") as unknown as { build(a: Record<string, unknown>): Ship }
    ).build({ name: "replacement" });
    await pirate.save();

    await expect(Ship.find(doomed.id)).rejects.toThrow(RecordNotFound);
  });

  it("build over a new-record owner does not nullify a persisted ship in the database", async () => {
    const other = await Pirate.create({ catchphrase: "Other" });
    const existing = await Ship.create({ name: "Interceptor", pirate_id: other.id });

    // `remove_target!` evaluates `owner.persisted?` (:108) at replace time, so a
    // new-record owner nullifies in memory only. Deferring the DB half must not
    // resurrect it once `save()` makes the owner persisted.
    const pirate = Pirate.new({ catchphrase: "Arrr" }) as ShipBuilder;
    pirate.ship = existing;
    await pirate.buildShip({ name: "brand new" });
    await pirate.save();

    expect((await Ship.find(existing.id)).pirate_id).toBe(Number(other.id));
  });

  it("build does not clobber a displacement already queued by the writer", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Arrr" })) as ShipBuilder;
    const original = await Ship.create({ name: "Black Pearl", pirate_id: pirate.id });
    await pirate.loadHasOne("ship");

    // The property setter queues `original` for removal; the unsaved `interim`
    // then displaced by `buildShip` has no row and must not take its place.
    pirate.ship = Ship.new({ name: "interim" });
    await pirate.buildShip({ name: "brand new" });
    await pirate.save();

    expect((await Ship.find(original.id)).pirate_id).toBeNull();
  });

  it("build on a has_one_through does not remove the displaced record", async () => {
    const member = await Member.create({ name: "Joe" });
    const oldClub = await Club.create({ name: "Old Club" });
    await (member.association("club") as unknown as { writer(v: Club): Promise<void> }).writer(
      oldClub,
    );
    await member.save();

    // `HasOneThroughAssociation#replace` (has_one_through_association.rb:10-13)
    // is `create_through_record` + `self.target = record` — no `remove_target!`.
    // A through's displaced record is reconciled by the join row, so the
    // inherited `set_new_record` removal must not reach it.
    const refetched = await Member.find(member.id);
    const loaded = await (
      refetched as unknown as { loadHasOne(n: "club"): Promise<Club | null> }
    ).loadHasOne("club");
    expect(loaded?.id).toBe(oldClub.id);

    (refetched.association("club") as unknown as { build(a: Record<string, unknown>): Club }).build(
      {
        name: "Final",
      },
    );

    // The removal would write a `club_id` a Club has no business owning, marking
    // it dirty and queueing it for a save the owner's autosave then performs.
    expect((loaded as unknown as { hasChangesToSave: boolean }).hasChangesToSave).toBe(false);
    expect(
      (refetched.association("club") as unknown as { _displacedRecords: Club[] })._displacedRecords,
    ).toHaveLength(0);
  });

  it("create on a has_one_through does not load or remove the displaced record", async () => {
    const member = await Member.create({ name: "Joe" });
    const oldClub = await Club.create({ name: "Old Club" });
    await (member.association("club") as unknown as { writer(v: Club): Promise<void> }).writer(
      oldClub,
    );
    await member.save();

    // `_createRecord` drains the displaced queue itself, so a through must opt
    // out there too — not just in `setNewRecord`. Otherwise the drain issues a
    // `load_target` Rails never performs for a through (whose `replace`
    // reconciles the join row) and hands the old club to `removeTargetBang`,
    // which nullifies a foreign key `Club` does not own. Only the INSERT and the
    // join-row reconcile SELECT should run, inside the savepoint pair — the
    // fifth query would be the `clubs` re-find.
    const refetched = await Member.find(member.id);
    await assertQueriesCount(4, false, async () => {
      await (
        refetched.association("club") as unknown as {
          create(a: Record<string, unknown>): Promise<Club>;
        }
      ).create({ name: "New Club" });
    });
  });
});
