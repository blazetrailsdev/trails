/**
 * Trails-only surface: what happens when the displacement removal a
 * nested-attributes assignment starts *fails*.
 *
 * Rails raises `RecordNotSaved` from `remove_target!` inline inside
 * `HasOneAssociation#replace`
 * (vendor/rails/activerecord/lib/active_record/associations/has_one_association.rb:95-115),
 * so `pirate.ship_attributes = {...}` surfaces the failure at the assignment
 * expression whether or not the owner is ever saved. A synchronous JS property
 * setter cannot raise on an async write, so trails splits that guarantee: the
 * awaitable `set#{Name}Attributes` writer raises at the assignment point, and the
 * synchronous setter's failure is parked on the owner permanently — every later
 * drain rethrows it, so an owner that is never saved never loses it.
 *
 * No Rails test covers a *failing* displacement removal, hence a trails-only
 * guard rather than a mirrored test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, type Base } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Bird } from "./test-helpers/models/bird.js";

interface RemovalHost {
  _pendingDisplacedRemovals?: Promise<unknown>[];
  _displacedRemovalFailure?: unknown;
}

/**
 * A pirate with a loaded, persisted ship whose displacement removal is rigged
 * to fail — the async analogue of Rails' `remove_target!` nullify save
 * returning false.
 */
async function pirateWithFailingRemoval(): Promise<Base> {
  const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
  await Ship.create({
    name: "Nights Dirty Lightning",
    pirate_id: (pirate as unknown as { id: number }).id,
  });
  await (pirate as unknown as { ship: Promise<Base | null> }).ship;

  const assoc = pirate.association("ship") as unknown as {
    detachDisplacedTarget: () => Promise<void>;
  };
  assoc.detachDisplacedTarget = () => Promise.reject(new Error("removal exploded"));
  return pirate;
}

describe("nested-attributes displacement removal failure", () => {
  fixtures(["pirates", "ships"]);

  beforeAll(() => {
    registerModel(Pirate);
    registerModel(Ship);
    registerModel(Bird);
  });

  it("detaches the displaced row at the assignment through the awaitable writer", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    const displaced = (await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    })) as Base;
    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    await (
      pirate as unknown as { setShipAttributes: (a: unknown) => Promise<void> }
    ).setShipAttributes({ name: "Davy Jones Gold Dagger" });

    // The owner is deliberately NOT saved: Rails' `replace` has already run
    // `remove_target!` by the time the assignment expression returns.
    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(null);
  });

  it("raises at the assignment through the awaitable writer, with no save", async () => {
    const pirate = await pirateWithFailingRemoval();

    await expect(
      (pirate as unknown as { setShipAttributes: (a: unknown) => Promise<void> }).setShipAttributes(
        { name: "Davy Jones Gold Dagger" },
      ),
    ).rejects.toThrow("removal exploded");
  });

  it("keeps the failure on the owner once it has been raised", async () => {
    const pirate = await pirateWithFailingRemoval();

    (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
      name: "Davy Jones Gold Dagger",
    };

    // Every drain rethrows: the first observation does not consume the failure,
    // so an owner saved (or re-assigned) later cannot silently succeed.
    await expect(pirate.save()).rejects.toThrow("removal exploded");
    await expect(pirate.save()).rejects.toThrow("removal exploded");
    expect((pirate as unknown as RemovalHost)._displacedRemovalFailure).toBeInstanceOf(Error);
  });

  it("surfaces the failure through an unrelated association's awaitable writer", async () => {
    const pirate = await pirateWithFailingRemoval();

    (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
      name: "Davy Jones Gold Dagger",
    };

    // The pending list and the sticky failure are per-owner, so the collection
    // writer rethrows the has_one's failure even though the crew assignment
    // itself succeeded: the owner instance is poisoned, and an awaitable write
    // to it must not proceed toward a `save()` that would persist two rows.
    await expect(
      (
        pirate as unknown as { setBirdsAttributes: (a: unknown) => Promise<void> }
      ).setBirdsAttributes([{ name: "Posideons Killer" }]),
    ).rejects.toThrow("removal exploded");
  });

  it("does not leave a floating rejection when the removal is never drained", async () => {
    const pirate = await pirateWithFailingRemoval();

    (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
      name: "Davy Jones Gold Dagger",
    };

    // The captured promise resolves *to* the error rather than rejecting, so a
    // never-drained removal cannot surface as an unhandled rejection.
    const pending = (pirate as unknown as RemovalHost)._pendingDisplacedRemovals ?? [];
    expect(pending).toHaveLength(1);
    await expect(pending[0]).resolves.toBeInstanceOf(Error);
  });
});
