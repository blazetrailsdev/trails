/**
 * HMT Slot E — Nested-through advanced. Closes the HMT cluster.
 * Regression contracts for
 * distinct, same-table-twice, polymorphic source + sourceType,
 * source-reflection reset between independent preloads, and the
 * autosave-skip guarantee. Mirrors selected scenarios from
 * vendor/rails/activerecord/test/cases/associations/nested_through_associations_test.rb.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Post } from "../test-helpers/models/post.js";
import { Hotel } from "../test-helpers/models/hotel.js";
import { Department } from "../test-helpers/models/department.js";
import { Chef } from "../test-helpers/models/chef.js";
import { CakeDesigner } from "../test-helpers/models/cake-designer.js";
import { DrinkDesigner } from "../test-helpers/models/drink-designer.js";

registerModel(Author);
registerModel(Tag);
registerModel(Tagging);
registerModel(Post);
registerModel(Hotel);
registerModel(Department);
registerModel(Chef);
registerModel(CakeDesigner);
registerModel(DrinkDesigner);

describe("HMT Slot E — nested-through advanced", () => {
  const { authors, tags, taggings } = useHandlerFixtures(
    ["authors", "authorAddresses", "posts", "taggings", "tags"],
    { schema: canonicalSchema },
  );

  it("distinct on the source-reflection scope returns one row when a tag is reachable via multiple posts", async () => {
    // david has two posts (welcome + thinking) each tagged "general".
    // distinctTags deduplicates by tag PK, so we get exactly one row.
    const david = authors("david");
    const general = tags("general");
    const result = await david.distinctTags.toArray();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(general.id);
  });

  it("preloading nested-through does not leak target rows between independent owner sets", async () => {
    const david = authors("david");
    const bob = authors("bob");
    // Load each author's tags in separate preload queries.
    const [davidRow] = await Author.where({ id: david.id }).preload("tags").toArray();
    const [bobRow] = await Author.where({ id: bob.id }).preload("tags").toArray();
    const davidTags = (davidRow.association("tags").target ?? []) as any[];
    const bobTags = (bobRow.association("tags").target ?? []) as any[];
    // david: welcome+thinking both tagged "general"
    expect(davidTags.every((t: any) => t.name === "General")).toBe(true);
    // bob: misc_by_bob + other_by_bob tagged misc/blue — distinct from general
    expect(bobTags.every((t: any) => t.name !== "General")).toBe(true);
  });

  it("table referenced multiple times in the nested chain aliases consistently across loads", async () => {
    // Author → posts → taggings: two separate preloads of the same chain
    // must produce stable results (no alias collision between invocations).
    const david = authors("david");
    const [r1] = await Author.where({ id: david.id }).preload("taggings").toArray();
    const [r2] = await Author.where({ id: david.id }).preload("taggings").toArray();
    const t1 = ((r1.association("taggings").target ?? []) as any[]).map((r: any) => r.id).sort();
    const t2 = ((r2.association("taggings").target ?? []) as any[]).map((r: any) => r.id).sort();
    expect(t1).toEqual(t2);
    // david has 2 post-taggings (welcome_general + thinking_general)
    expect(t1.length).toBe(2);
  });

  it("through with polymorphic source + sourceType filters cross-type targets out of the result", async () => {
    // Hotel → chefs (polymorphic employable) → cakeDesigners (sourceType filter).
    // A drink designer that shares the chefs table must not appear in cakeDesigners.
    const cake = await CakeDesigner.create({});
    const drink = await DrinkDesigner.create({});
    const dept = await Department.create({});
    const cakeChef = await Chef.create({
      department_id: (dept as any).id,
      employable_id: (cake as any).id,
      employable_type: "CakeDesigner",
    });
    const drinkChef = await Chef.create({
      department_id: (dept as any).id,
      employable_id: (drink as any).id,
      employable_type: "DrinkDesigner",
    });
    void cakeChef;
    void drinkChef;
    const hotel = await Hotel.create({ departments: [dept] });
    const cakes = await (hotel as any).cakeDesigners.toArray();
    expect(cakes.length).toBe(1);
    expect(cakes[0].id).toBe((cake as any).id);
  });

  it("preloading two independent author sets keeps each owner's nested-through targets isolated", async () => {
    // Preload all authors' tags in one query — each owner must get only their own tags.
    const david = authors("david");
    const bob = authors("bob");
    const preloaded = await Author.where({ id: [david.id, bob.id] })
      .preload("tags")
      .toArray();
    const byId = new Map(preloaded.map((row) => [row.id, row]));
    const davidTags = ((byId.get(david.id)!.association("tags").target ?? []) as any[]).map(
      (t) => t.name,
    );
    const bobTags = ((byId.get(bob.id)!.association("tags").target ?? []) as any[]).map(
      (t) => t.name,
    );
    expect(davidTags.every((n: any) => n === "General")).toBe(true);
    expect(bobTags.some((n: any) => n !== "General")).toBe(true);
  });

  it("nested-through must not autosave: reading the proxy after save inserts nothing", async () => {
    // Re-saving an author must not insert duplicate taggings via the
    // nested-through chain. Count before and after must match.
    const david = authors("david");
    const before = await Tagging.where({ taggable_type: "Post" }).count();
    await david.save();
    const tags = await david.tags.toArray();
    expect(tags.length).toBeGreaterThan(0);
    const after = await Tagging.where({ taggable_type: "Post" }).count();
    expect(after).toBe(before);
  });
});
