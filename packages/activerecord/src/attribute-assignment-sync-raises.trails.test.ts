import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, type Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Ship } from "./test-helpers/models/ship.js";

interface PirateHandle {
  id: number;
  ship: Promise<Base | null>;
  setAttributes(attrs: unknown): Promise<void> | void;
  save(): Promise<boolean>;
}

describe("synchronous attribute assignment that owes a read", () => {
  fixtures(["pirates", "ships"]);

  beforeAll(async () => {
    registerModel(Pirate);
    registerModel(Ship);
    await Pirate.loadSchema();
    await Ship.loadSchema();
  });

  it("raises at the assignment instead of deferring it to save", async () => {
    const pirate = (await Pirate.createBang({ catchphrase: "Aye" })) as unknown as PirateHandle;
    const ship = (await Ship.createBang({
      name: "Nights Dirty Lightning",
      pirate_id: pirate.id,
    })) as unknown as { id: number };
    expect((pirate as unknown as Base).association("ship").isLoaded()).toBe(false);

    expect(() => {
      (pirate as unknown as { attributes: Record<string, unknown> }).attributes = {
        shipAttributes: { id: ship.id, name: "Davy Jones Gold Dagger" },
      };
    }).toThrow(/setAttributes/);
  });

  it("completes the same assignment through the awaitable spelling", async () => {
    const pirate = (await Pirate.createBang({ catchphrase: "Aye" })) as unknown as PirateHandle;
    const ship = (await Ship.createBang({
      name: "Nights Dirty Lightning",
      pirate_id: pirate.id,
    })) as unknown as { id: number };

    await pirate.setAttributes({
      shipAttributes: { id: ship.id, name: "Davy Jones Gold Dagger" },
    });

    const target = (await pirate.ship) as unknown as { name: string };
    expect(target.name).toBe("Davy Jones Gold Dagger");
  });

  it("assigns an association-valued scope attribute without parking a promise", async () => {
    const pirate = (await Pirate.createBang({ catchphrase: "Arrr" })) as unknown as { id: number };
    const scoped = (Ship as unknown as { where(h: object): Record<string, unknown> }).where({
      pirate,
    });
    const built = (scoped["new"] as (a: object) => unknown).call(scoped, {
      name: "The Black Rock",
    }) as { pirate_id: number; save(): Promise<boolean> };

    expect(built.pirate_id).toBe(pirate.id);
    expect(await built.save()).toBe(true);
  });
});
