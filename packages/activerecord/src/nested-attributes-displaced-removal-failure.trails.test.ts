import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, type Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Ship } from "./test-helpers/models/ship.js";

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

    expect(pirate.association("ship").target).toBe(displaced);
  });
});
