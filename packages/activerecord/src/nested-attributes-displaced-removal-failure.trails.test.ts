/**
 * Trails-only surface: what happens when the displacement removal a
 * nested-attributes assignment starts *fails*.
 *
 * Rails raises `RecordNotSaved` from `remove_target!` inline inside
 * `HasOneAssociation#replace`
 * (vendor/rails/activerecord/lib/active_record/associations/has_one_association.rb:95-115),
 * so `pirate.ship_attributes = {...}` surfaces the failure at the assignment
 * expression whether or not the owner is ever saved. A synchronous JS property
 * setter cannot raise on an async write — so it does not start one: the
 * awaitable `set#{Name}Attributes` writer runs the load, the removal and the
 * target install in Rails' order and raises at the assignment point, while the
 * Rails-named setter refuses a displacing assignment up front
 * (`NestedAttributesDisplacementError`) instead of parking a write that would
 * fail later.
 *
 * No Rails test covers a *failing* displacement removal, hence a trails-only
 * guard rather than a mirrored test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, NestedAttributesDisplacementError, type Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Bird } from "./test-helpers/models/bird.js";

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

  it("leaves the displaced record cached when the removal fails", async () => {
    const pirate = await pirateWithFailingRemoval();
    const displaced = pirate.association("ship").target;

    await expect(
      (pirate as unknown as { setShipAttributes: (a: unknown) => Promise<void> }).setShipAttributes(
        { name: "Davy Jones Gold Dagger" },
      ),
    ).rejects.toThrow("removal exploded");

    // Rails reaches `self.target = record` (:84) only after `remove_target!`
    // (:69), so a raising removal leaves the OLD record cached — the ordering
    // the retired target swap could not express.
    expect(pirate.association("ship").target).toBe(displaced);
  });

  it("parks no removal for a synchronous displacing assignment to fail later", async () => {
    const pirate = await pirateWithFailingRemoval();

    // The setter refuses instead of starting a write it cannot await, so there
    // is no deferred failure to surface at `save()` — and nothing that could
    // become an unhandled rejection if the owner is never saved.
    expect(() => {
      (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
        name: "Davy Jones Gold Dagger",
      };
    }).toThrow(NestedAttributesDisplacementError);

    await expect(pirate.save()).resolves.toBe(true);
  });

  it("leaves an unrelated association's awaitable writer unaffected", async () => {
    const pirate = await pirateWithFailingRemoval();

    expect(() => {
      (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
        name: "Davy Jones Gold Dagger",
      };
    }).toThrow(NestedAttributesDisplacementError);

    // With no parked removal, there is no owner-wide sticky failure left for an
    // unrelated writer to inherit: the refusal was terminal at its own call site.
    await expect(
      (
        pirate as unknown as { setBirdsAttributes: (a: unknown) => Promise<void> }
      ).setBirdsAttributes([{ name: "Posideons Killer" }]),
    ).resolves.toBeUndefined();
  });
});
