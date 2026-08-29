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

    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    await (pirate as unknown as { setShipAttributes(a: object): Promise<void> }).setShipAttributes({
      name: "Davy Jones Gold Dagger",
    });

    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(null);
  });

  it("keeps the writer synchronous when the assignment displaces nothing", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as Base;
    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    const pending = (
      pirate as unknown as { setShipAttributes(a: object): Promise<void> | void }
    ).setShipAttributes({ name: "Davy Jones Gold Dagger" });
    expect(pending).toBeUndefined();
    await pirate.save();

    const ship = (await (pirate as unknown as { ship: Promise<Base | null> }).ship) as Base;
    expect((ship as unknown as { name: string }).name).toBe("Davy Jones Gold Dagger");
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
    assoc.buildRecord = () => {
      throw new Error("build exploded");
    };

    expect(() => {
      void (
        refetched as unknown as { setShipAttributes(a: object): Promise<void> | void }
      ).setShipAttributes({
        name: "Davy Jones Gold Dagger",
      });
    }).toThrow("build exploded");

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
    (displaced as unknown as { name: string | null }).name = null;

    await expect(
      (pirate as unknown as { buildShip(a: object): Promise<Base> }).buildShip({
        name: "Davy Jones Gold Dagger",
      }),
    ).rejects.toThrow(RecordNotSaved);

    expect(pirate.association("ship").target).toBe(displaced);
  });

  it("returns the built record synchronously when no query would run", async () => {
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
      void (
        pirate as unknown as { setShipAttributes(a: object): Promise<void> | void }
      ).setShipAttributes({
        name: "Davy Jones Gold Dagger",
      });
    }).toThrow("build exploded");

    expect(detached).toBe(false);
    const reloaded = (await Ship.find((displaced as unknown as { id: number }).id)) as Base;
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(
      (pirate as unknown as { id: number }).id,
    );
  });

  it("runs remove_target!'s delete arm over an unsaved displaced record", async () => {
    const firm = new (ExclusivelyDependentFirm as unknown as new () => Base)();
    const assoc = (
      firm as unknown as { association(n: string): { build(a: object): unknown } }
    ).association("account");

    const displaced = assoc.build({ credit_limit: 10 }) as Base;
    await assoc.build({ credit_limit: 20 });

    expect((displaced as unknown as { isDestroyed(): boolean }).isDestroyed()).toBe(true);
  });
});
