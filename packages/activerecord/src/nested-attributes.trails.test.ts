import type { Base } from "./index.js";
import { describe, it, expect } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { CpkBook, CpkOrder, CpkCar, CpkCarReview } from "./test-helpers/models/cpk.js";
import { Category } from "./test-helpers/models/category.js";
import { Categorization } from "./test-helpers/models/categorization.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Parrot } from "./test-helpers/models/parrot.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Developer } from "./test-helpers/models/developer.js";

const cols = (record: Base): Record<string, unknown> =>
  record as unknown as Record<string, unknown>;
const nested = (record: Base): Record<string, (attributes: unknown) => Promise<void>> =>
  record as unknown as Record<string, (attributes: unknown) => Promise<void>>;
const readAttr = (record: Base, name: string): unknown =>
  (record as unknown as { _readAttribute(n: string): unknown })._readAttribute(name);

describe("nested attributes (trails-only)", () => {
  fixtures({
    cpk_orders: [CpkOrder, {}],
    cpk_books: [CpkBook, {}],
    cpk_cars: [CpkCar, {}],
    cpk_car_reviews: [CpkCarReview, {}],
    categories: [Category, {}],
    categorizations: [Categorization, {}],
  });

  it("builds a new belongs_to record with a composite foreign key", async () => {
    CpkBook.acceptsNestedAttributesFor("order");

    const book = await CpkBook.createBang({ id: [1, 1], title: "T" });
    await nested(book).setOrderAttributes({ shop_id: 7, status: "open" });
    await book.save();

    const order = await CpkOrder.where({ shop_id: 7, status: "open" }).first();
    const orderId = readAttr(order as Base, "id");
    expect(cols(book).shop_id).toBe(7);
    expect(Number(cols(book).order_id)).toBe(Number(orderId));

    const reloaded = (await CpkBook.find([1, 1])) as CpkBook;
    expect(cols(reloaded).shop_id).toBe(7);
    expect(Number(cols(reloaded).order_id)).toBe(Number(orderId));
  });

  it("find with duplicate composite ids uniqs to a single wrapped record", async () => {
    await CpkBook.createBang({ id: [1, 1], title: "Dup" });

    const found = (await CpkBook.find([
      [1, 1],
      [1, 1],
    ])) as CpkBook[];
    expect(found).toHaveLength(1);
    expect(cols(found[0]).title).toBe("Dup");
  });

  it("find with variadic duplicate composite ids uniqs to a bare record", async () => {
    await CpkBook.createBang({ id: [2, 2], title: "VarDup" });

    const found = (await CpkBook.find([2, 2], [2, 2])) as unknown as CpkBook;
    expect(Array.isArray(found)).toBe(false);
    expect(cols(found).title).toBe("VarDup");
  });

  it("increments the target counter cache when the nested belongs_to is created", async () => {
    Categorization.acceptsNestedAttributesFor("category");

    const categorization = await Categorization.create({});
    await nested(categorization).setCategoryAttributes({ name: "General" });
    await categorization.save();

    const category = await Category.findBy({ name: "General" });
    expect(category).not.toBeNull();
    expect(Number(cols(categorization).category_id)).toBe(Number(cols(category as Base).id));
    expect(cols(category as Base).categorizations_count).toBe(1);
  });

  it("builds nested children on a bare CPK subclass with the declaring model's composite foreign key", async () => {
    class CpkSportsCar extends CpkCar {
      static _demodulizedName = "SportsCar";
    }
    registerModel(CpkSportsCar);
    CpkSportsCar.acceptsNestedAttributesFor("carReviews");

    const car = await CpkSportsCar.createBang({ make: "Honda", model: "Civic" });
    await nested(car).setCarReviewsAttributes([{ comment: "zippy", rating: 5 }]);
    await car.save();

    const reviews = await CpkCarReview.where({ car_make: "Honda", car_model: "Civic" });
    expect(reviews.length).toBe(1);
    expect(cols(reviews[0]).comment).toBe("zippy");
    expect(cols(reviews[0]).car_make).toBe("Honda");
    expect(cols(reviews[0]).car_model).toBe("Civic");
  });
});

describe("nested attributes flush path alias resolution (trails-only)", () => {
  fixtures({
    pirates: [Pirate, {}],
    parrots: [Parrot, {}],
  });

  it("updates an existing record via an alias-backed nested key on the flush path", async () => {
    Pirate.acceptsNestedAttributesFor("parrot");

    const parrot = await Parrot.createBang({ name: "Original" });
    const pirate = await Pirate.createBang({
      catchphrase: "Arr",
      parrot_id: readAttr(parrot, "id"),
    });

    await nested(pirate).setParrotAttributes({ id: readAttr(parrot, "id"), title: "Renamed" });
    await pirate.save();

    const reloaded = await Parrot.find(readAttr(parrot, "id"));
    expect(readAttr(reloaded, "name")).toBe("Renamed");
  });
});

describe("nested attributes save wrapper argument forwarding (trails-only)", () => {
  fixtures({
    pirates: [Pirate, {}],
    ships: [Ship, {}],
    developers: [Developer, {}],
  });

  it("assigns scalar attributes before nested ones within one update", async () => {
    Pirate.acceptsNestedAttributesFor("ship", {
      rejectIf: (_attrs, record) => cols(record).catchphrase !== "Aye",
    });

    const pirate = await Pirate.createBang({ catchphrase: "Arr" });
    await pirate.update({
      shipAttributes: { name: "Black Pearl" },
      catchphrase: "Aye",
    });

    const ship = await Ship.where({ pirate_id: readAttr(pirate, "id") }).first();
    expect(cols(ship as Base).name).toBe("Black Pearl");

    Pirate.acceptsNestedAttributesFor("ship");
  });

  it("assigns constructor nested attributes without the property setter", async () => {
    Pirate.acceptsNestedAttributesFor("ship");
    expect(Object.getOwnPropertyDescriptor(Pirate.prototype, "shipAttributes")).toBeUndefined();

    const pirate = new Pirate({ catchphrase: "Arr", shipAttributes: { name: "Black Pearl" } });
    await pirate.saveBang();
    expect(
      cols((await Ship.where({ pirate_id: readAttr(pirate, "id") }).first()) as Base).name,
    ).toBe("Black Pearl");

    const created = await Pirate.createBang({
      catchphrase: "Aye",
      shipAttributes: { name: "Flying Dutchman" },
    });
    expect(
      cols((await Ship.where({ pirate_id: readAttr(created, "id") }).first()) as Base).name,
    ).toBe("Flying Dutchman");
  });

  it("forwards save options through the nested-attributes save wrapper", async () => {
    Pirate.acceptsNestedAttributesFor("ship");

    const pirate = await Pirate.createBang({ catchphrase: "Arr" });
    pirate.catchphrase = "";

    expect(await pirate.save({ validate: false })).toBe(true);
    expect((await Pirate.find(readAttr(pirate, "id"))).catchphrase).toBe("");
  });
});

describe("nested attributes assignment ordering (trails-only)", () => {
  fixtures({
    pirates: [Pirate, {}],
    ships: [Ship, {}],
    parrots: [Parrot, {}],
  });

  it("assigns nested parameter hashes after the base attributes", async () => {
    const config = Pirate.nestedAttributesOptions.ship;
    const originalRejectIf = config.rejectIf;
    const observed: unknown[] = [];
    config.rejectIf = (_attrs: Record<string, unknown>, record: Base) => {
      observed.push((record as Pirate).catchphrase);
      return false;
    };

    try {
      const pirate = new Pirate();
      await pirate.assignAttributes({
        shipAttributes: { name: "The Black Rock" },
        catchphrase: "Aye",
      });
    } finally {
      config.rejectIf = originalRejectIf;
    }

    expect(observed).toEqual(["Aye"]);
  });

  it("completes the displacing write through setAttributes before save", async () => {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as unknown as Pirate;
    const displaced = await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    });
    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    expect(
      await pirate.setAttributes({ shipAttributes: { name: "Davy Jones Gold Dagger" } }),
    ).toBeUndefined();
    await pirate.save();

    const reloaded = await Ship.find((displaced as unknown as { id: number }).id);
    expect((reloaded as unknown as { pirate_id: number | null }).pirate_id).toBe(null);
  });

  it("sequences one existing collection record's assignment before the next", async () => {
    Pirate.acceptsNestedAttributesFor("parrots");

    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as unknown as Pirate;
    const parrots = (
      pirate as unknown as {
        parrots: {
          create(attrs: Record<string, unknown>): Promise<Base>;
          toArray(): Promise<Base[]>;
        };
      }
    ).parrots;
    const first = await parrots.create({ name: "First" });
    const second = await parrots.create({ name: "Second" });
    await parrots.toArray();

    const events: string[] = [];
    const proto = Parrot.prototype as unknown as {
      setAttributes(attrs: Record<string, unknown>): Promise<void> | void;
    };
    const original = proto.setAttributes;
    proto.setAttributes = function (this: Base, attrs: Record<string, unknown>) {
      const name = String((attrs as { name?: unknown }).name);
      events.push(`start:${name}`);
      const result = original.call(this, attrs);
      return Promise.resolve(result).then(() => {
        events.push(`end:${name}`);
      });
    };

    try {
      await nested(pirate).setParrotsAttributes({
        a: { id: readAttr(first, "id"), name: "Renamed First" },
        b: { id: readAttr(second, "id"), name: "Renamed Second" },
      });
    } finally {
      proto.setAttributes = original;
    }

    expect(events).toEqual([
      "start:Renamed First",
      "end:Renamed First",
      "start:Renamed Second",
      "end:Renamed Second",
    ]);
  });

  it("finishes a displacing nested assignment before assigning the next key", async () => {
    Pirate.acceptsNestedAttributesFor("parrots");
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as unknown as Pirate;
    await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    });
    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    const events: string[] = [];
    const assoc = pirate.association("ship") as unknown as {
      detachDisplacedTarget: () => Promise<void>;
    };
    const removeTarget = assoc.detachDisplacedTarget.bind(assoc);
    assoc.detachDisplacedTarget = async () => {
      events.push("remove_target!:start");
      await removeTarget();
      events.push("remove_target!:end");
    };

    const config = Pirate.nestedAttributesOptions.parrots;
    config.rejectIf = () => {
      events.push("parrots");
      return false;
    };

    await pirate.setAttributes({
      shipAttributes: { name: "Davy Jones Gold Dagger" },
      parrotsAttributes: { foo: { name: "Posideons Killer" } },
    });

    expect(events).toEqual(["remove_target!:start", "remove_target!:end", "parrots"]);
  });

  it("finishes a displacing nested assignment before the next key on update", async () => {
    Pirate.acceptsNestedAttributesFor("parrots");
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as unknown as Pirate;
    await Ship.create({
      name: "Nights Dirty Lightning",
      pirate_id: (pirate as unknown as { id: number }).id,
    });
    await (pirate as unknown as { ship: Promise<Base | null> }).ship;

    const events: string[] = [];
    const assoc = pirate.association("ship") as unknown as {
      detachDisplacedTarget: () => Promise<void>;
    };
    const removeTarget = assoc.detachDisplacedTarget.bind(assoc);
    assoc.detachDisplacedTarget = async () => {
      events.push("remove_target!:start");
      await removeTarget();
      events.push("remove_target!:end");
    };

    const config = Pirate.nestedAttributesOptions.parrots;
    config.rejectIf = () => {
      events.push("parrots");
      return false;
    };

    await (pirate as unknown as { update(a: Record<string, unknown>): Promise<unknown> }).update({
      shipAttributes: { name: "Davy Jones Gold Dagger" },
      parrotsAttributes: { foo: { name: "Posideons Killer" } },
    });

    expect(events.slice(0, 3)).toEqual(["remove_target!:start", "remove_target!:end", "parrots"]);
  });
});

describe("nested attributes destroy dispatch (trails-only)", () => {
  fixtures({
    pirates: [Pirate, {}],
    ships: [Ship, {}],
    developers: [Developer, {}],
  });

  it("dispatches the _destroy flag through the record's markForDestruction", async () => {
    Pirate.acceptsNestedAttributesFor("ship", { allowDestroy: true });
    const pirate = await Pirate.createBang({ catchphrase: "Arr" });
    const ship = await (
      pirate as unknown as { createShip(a: Record<string, unknown>): Promise<Ship> }
    ).createShip({ name: "Nights Dirty Lightning" });

    const original = Ship.prototype.markForDestruction;
    let calls = 0;
    Ship.prototype.markForDestruction = function (this: Ship): void {
      calls += 1;
      original.call(this);
    };
    try {
      await (pirate as unknown as { update(a: Record<string, unknown>): Promise<unknown> }).update({
        shipAttributes: { id: ship.id, _destroy: "1" },
      });
    } finally {
      Ship.prototype.markForDestruction = original;
    }

    expect(calls).toBe(1);
    expect(await Ship.findBy({ id: ship.id })).toBeNull();
  });
});

describe("nested attributes existing record lookup (trails-only)", () => {
  fixtures({
    pirates: [Pirate, {}],
    parrots: [Parrot, {}],
  });

  it("hands a callback the existing record's persisted columns", async () => {
    const pirate = await Pirate.createBang({ catchphrase: "Aye" });
    const parrot = await Parrot.createBang({ name: "Polly", color: "green" });
    await (pirate as unknown as { parrots: { push(record: Base): Promise<unknown> } }).parrots.push(
      parrot,
    );
    await (parrot as unknown as { update(attrs: unknown): Promise<boolean> }).update({
      updated_count: 5,
    });

    const persistedCount = Number((await Parrot.find(parrot.id)).updated_count);

    const reloaded = await Pirate.find(pirate.id);
    expect(reloaded.association("parrots").isLoaded()).toBe(false);

    await nested(reloaded).setParrotsAttributes([
      { id: readAttr(parrot as Base, "id"), name: "Polly Two" },
    ]);

    const target = (reloaded.association("parrots") as unknown as { target: Base[] }).target;
    const existing = target.find(
      (r) => String((r as unknown as { id: unknown }).id) === String(parrot.id),
    ) as Base;
    expect(Number(readAttr(existing, "updated_count"))).toBe(persistedCount);
    expect(readAttr(existing, "color")).toBe("green");

    await reloaded.save();

    const persisted = await Parrot.find(parrot.id);
    expect(persisted.name).toBe("Polly Two");
    expect(Number(persisted.updated_count)).toBe(persistedCount + 1);
  });
});
