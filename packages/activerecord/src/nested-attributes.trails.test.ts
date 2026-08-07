/**
 * Trails-only nested-attributes cases with no counterpart in Rails'
 * nested_attributes_test.rb. Kept separate from the faithful mirror
 * (`nested-attributes.test.ts`) so `test:compare` maps the mirror cleanly.
 *
 * These exercise composite-foreign-key and counter-cache interactions that the
 * Rails suite does not cover but trails needs to guard.
 */
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

// Dynamic column reads/writes (FK/counter-cache columns and the generated
// `*Attributes=` setters vary per model and are not statically declared), kept
// type-safe via an unknown-valued record view.
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

    // Rails `find_with_ids` applies `ids.compact.uniq` to the composite tuple
    // list too, so `find([[1, 1], [1, 1]])` collapses to one tuple and returns
    // the single record, still wrapped per `expects_array`.
    const found = (await CpkBook.find([
      [1, 1],
      [1, 1],
    ])) as CpkBook[];
    expect(found).toHaveLength(1);
    expect(cols(found[0]).title).toBe("Dup");
  });

  it("find with variadic duplicate composite ids uniqs to a bare record", async () => {
    await CpkBook.createBang({ id: [2, 2], title: "VarDup" });

    // Rails `expects_array = ids.first.first.is_a?(Array)` is false for a
    // variadic call, so `find([2, 2], [2, 2])` dedupes to one tuple and
    // returns the bare record (not `[record]`) — see finder_methods.rb:494-513.
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

  // The post-save flush (`processNestedAttributes`) routes an existing-record
  // update through `existing.update(childAttrs)`. The alias-backed key `title`
  // (aliasAttribute("title", "name")) has a real writer, so it must update the
  // record rather than raise UnknownAttributeError — matching the build path,
  // which Rails' `assign_attributes` → `_assign_attribute` also resolves.
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
  });

  // `acceptsNestedAttributesFor` wraps `save` to flush pending nested
  // attributes. The wrapper is invisible in Rails (the flush happens inside the
  // ordinary save), so it must be argument-transparent: dropping its options
  // silently re-enabled validations for every model that accepts nested
  // attributes.
  // Rails buckets Hash-valued keys into `nested_parameter_attributes` and
  // assigns them only after the scalar pass (attribute_assignment.rb:7-25), so
  // `reject_if` sees the owner attributes the same `update` call assigned. A
  // single-pass loop leaves that to hash key order.
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

  // `new Model(...)` / `Model.create(...)` reach the nested writer by Rails
  // name (`public_send("#{k}=")`, attribute_assignment.rb:35-48), not by
  // hunting a `#{name}Attributes=` descriptor on the prototype. Deleting the
  // property setter — which RFC 0087 does next — must therefore leave
  // construction-time nested attributes assigned rather than silently skipped.
  it("assigns constructor nested attributes without the property setter", async () => {
    Pirate.acceptsNestedAttributesFor("ship");
    const setterDescriptor = Object.getOwnPropertyDescriptor(Pirate.prototype, "shipAttributes")!;
    delete (Pirate.prototype as unknown as Record<string, unknown>).shipAttributes;

    try {
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
    } finally {
      Object.defineProperty(Pirate.prototype, "shipAttributes", setterDescriptor);
    }
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
  });

  // `_assign_attributes` (attribute_assignment.rb:6-22) buckets every
  // Hash-valued key out of the main loop and assigns it only after the scalar
  // pass (:21), so a nested writer's `reject_if` observes an owner whose own
  // attributes are already set — even when the nested key sits first in the
  // literal.
  it("assigns nested parameter hashes after the base attributes", () => {
    const config = (
      Pirate as unknown as {
        _nestedAttributeConfigs: {
          associationName: string;
          options: { rejectIf?: unknown };
        }[];
      }
    )._nestedAttributeConfigs.find((c) => c.associationName === "ship")!;
    const originalRejectIf = config.options.rejectIf;
    const observed: unknown[] = [];
    config.options.rejectIf = (_attrs: Record<string, unknown>, record: Base) => {
      observed.push((record as Pirate).catchphrase);
      return false;
    };

    try {
      const pirate = new Pirate();
      pirate.assignAttributes({
        shipAttributes: { name: "The Black Rock" },
        catchphrase: "Aye",
      });
    } finally {
      config.options.rejectIf = originalRejectIf;
    }

    expect(observed).toEqual(["Aye"]);
  });

  // `_assign_attributes` and `assign_nested_parameter_attributes`
  // (attribute_assignment.rb:9-23, 26-28) are plain `each` loops, so an
  // assignment that reaches DB I/O — a displacing `#{name}_attributes=` running
  // `load_target` / `remove_target!` (has_one_association.rb:59-69) — finishes
  // before the next key is assigned.
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

    const config = (
      Pirate as unknown as {
        _nestedAttributeConfigs: { associationName: string; options: { rejectIf?: unknown } }[];
      }
    )._nestedAttributeConfigs.find((c) => c.associationName === "parrots")!;
    config.options.rejectIf = () => {
      events.push("parrots");
      return false;
    };

    await pirate.assignAttributes({
      shipAttributes: { name: "Davy Jones Gold Dagger" },
      parrotsAttributes: { foo: { name: "Posideons Killer" } },
    });

    expect(events).toEqual(["remove_target!:start", "remove_target!:end", "parrots"]);
  });
});
