/**
 * Trails-only nested-attributes cases with no counterpart in Rails'
 * nested_attributes_test.rb. Kept separate from the faithful mirror
 * (`nested-attributes.test.ts`) so `test:compare` maps the mirror cleanly.
 *
 * These exercise composite-foreign-key and counter-cache interactions that the
 * Rails suite does not cover but trails needs to guard.
 */
import type { Base } from "./index.js";
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, acceptsNestedAttributesFor, assignNestedAttributes } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { CpkBook, CpkOrder, CpkCar, CpkCarReview } from "./test-helpers/models/cpk.js";
import { Category } from "./test-helpers/models/category.js";
import { Categorization } from "./test-helpers/models/categorization.js";

// Dynamic column reads (FK/counter-cache columns vary per model and are not
// statically declared), kept type-safe via an unknown-valued record view.
const cols = (record: Base): Record<string, unknown> =>
  record as unknown as Record<string, unknown>;
const readAttr = (record: Base, name: string): unknown =>
  (record as unknown as { _readAttribute(n: string): unknown })._readAttribute(name);

describe("nested attributes (trails-only)", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });

  it("builds a new belongs_to record with a composite foreign key", async () => {
    registerModel(CpkOrder);
    registerModel(CpkBook);
    acceptsNestedAttributesFor(CpkBook, "order");

    const book = await CpkBook.createBang({ author_id: 1, id: 1, title: "T" });
    assignNestedAttributes(book, "order", [{ shop_id: 7, status: "open" }]);
    await book.save();

    const order = await CpkOrder.where({ shop_id: 7, status: "open" }).first();
    const orderId = readAttr(order as Base, "id");
    expect(cols(book).shop_id).toBe(7);
    expect(Number(cols(book).order_id)).toBe(Number(orderId));

    const reloaded = (await CpkBook.find([1, 1])) as CpkBook;
    expect(cols(reloaded).shop_id).toBe(7);
    expect(Number(cols(reloaded).order_id)).toBe(Number(orderId));
  });

  it("increments the target counter cache when the nested belongs_to is created", async () => {
    registerModel(Category);
    registerModel(Categorization);
    acceptsNestedAttributesFor(Categorization, "category");

    const categorization = await Categorization.create({});
    assignNestedAttributes(categorization, "category", [{ name: "General" }]);
    await categorization.save();

    const category = await Category.findBy({ name: "General" });
    expect(category).not.toBeNull();
    expect(Number(cols(categorization).category_id)).toBe(Number(cols(category as Base).id));
    expect(cols(category as Base).categorizations_count).toBe(1);
  });

  it("builds nested children on a bare CPK subclass with the declaring model's composite foreign key", async () => {
    registerModel(CpkCar);
    registerModel(CpkCarReview);
    class CpkSportsCar extends CpkCar {
      static _demodulizedName = "SportsCar";
    }
    registerModel(CpkSportsCar);
    acceptsNestedAttributesFor(CpkSportsCar, "carReviews");

    const car = await CpkSportsCar.createBang({ make: "Honda", model: "Civic" });
    assignNestedAttributes(car, "carReviews", [{ comment: "zippy", rating: 5 }]);
    await car.save();

    const reviews = await CpkCarReview.where({ car_make: "Honda", car_model: "Civic" });
    expect(reviews.length).toBe(1);
    expect(cols(reviews[0]).comment).toBe("zippy");
    expect(cols(reviews[0]).car_make).toBe("Honda");
    expect(cols(reviews[0]).car_model).toBe("Civic");
  });
});
