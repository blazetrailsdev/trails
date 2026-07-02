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
import { fixtures } from "./test-helpers/fixtures.js";
import { CpkBook, CpkOrder, CpkCar, CpkCarReview } from "./test-helpers/models/cpk.js";
import { Category } from "./test-helpers/models/category.js";
import { Categorization } from "./test-helpers/models/categorization.js";

// Dynamic column reads/writes (FK/counter-cache columns and the generated
// `*Attributes=` setters vary per model and are not statically declared), kept
// type-safe via an unknown-valued record view.
const cols = (record: Base): Record<string, unknown> =>
  record as unknown as Record<string, unknown>;
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

    const book = await CpkBook.createBang({ author_id: 1, id: 1, title: "T" });
    cols(book).orderAttributes = { shop_id: 7, status: "open" };
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
    await CpkBook.createBang({ author_id: 1, id: 1, title: "Dup" });

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
    await CpkBook.createBang({ author_id: 2, id: 2, title: "VarDup" });

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
    cols(categorization).categoryAttributes = { name: "General" };
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
    cols(car).carReviewsAttributes = [{ comment: "zippy", rating: 5 }];
    await car.save();

    const reviews = await CpkCarReview.where({ car_make: "Honda", car_model: "Civic" });
    expect(reviews.length).toBe(1);
    expect(cols(reviews[0]).comment).toBe("zippy");
    expect(cols(reviews[0]).car_make).toBe("Honda");
    expect(cols(reviews[0]).car_model).toBe("Civic");
  });
});
