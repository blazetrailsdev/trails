import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
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
  const { authors, tags, taggings } = fixtures([
    "authors",
    "authorAddresses",
    "posts",
    "taggings",
    "tags",
  ]);

  it("distinct on the source-reflection scope returns one row when a tag is reachable via multiple posts", async () => {
    const david = authors("david");
    const general = tags("general");
    const result = await david.distinctTags;
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(general.id);
  });

  it("preloading nested-through does not leak target rows between independent owner sets", async () => {
    const david = authors("david");
    const bob = authors("bob");
    const [davidRow] = await Author.where({ id: david.id }).preload(":tags");
    const [bobRow] = await Author.where({ id: bob.id }).preload(":tags");
    const davidTags = (davidRow.association("tags").target ?? []) as any[];
    const bobTags = (bobRow.association("tags").target ?? []) as any[];
    expect(davidTags.every((t: any) => t.name === "General")).toBe(true);
    expect(bobTags.every((t: any) => t.name !== "General")).toBe(true);
  });

  it("table referenced multiple times in the nested chain aliases consistently across loads", async () => {
    const david = authors("david");
    const [r1] = await Author.where({ id: david.id }).preload(":taggings");
    const [r2] = await Author.where({ id: david.id }).preload(":taggings");
    const t1 = ((r1.association("taggings").target ?? []) as any[]).map((r: any) => r.id).sort();
    const t2 = ((r2.association("taggings").target ?? []) as any[]).map((r: any) => r.id).sort();
    expect(t1).toEqual(t2);
    expect(t1.length).toBe(2);
  });

  it("through with polymorphic source + sourceType filters cross-type targets out of the result", async () => {
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
    const david = authors("david");
    const bob = authors("bob");
    const preloaded = await Author.where({ id: [david.id, bob.id] }).preload(":tags");
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
    const david = authors("david");
    const before = await Tagging.where({ taggable_type: "Post" }).count();
    await david.save();
    const tags = await david.tags;
    expect(tags.length).toBeGreaterThan(0);
    const after = await Tagging.where({ taggable_type: "Post" }).count();
    expect(after).toBe(before);
  });
});
