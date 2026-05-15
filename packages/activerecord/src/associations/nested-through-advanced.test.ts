/**
 * HMT Slot E — Nested-through advanced. Closes the HMT cluster
 * (docs/activerecord-100-clusters.md). Regression contracts for
 * distinct, same-table-twice, polymorphic source + sourceType,
 * source-reflection reset between independent preloads, and the
 * autosave-skip guarantee. Mirrors selected scenarios from
 * vendor/rails/activerecord/test/cases/associations/nested_through_associations_test.rb.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations, loadHasManyThrough } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("HMT Slot E — nested-through advanced", () => {
  let adapter: DatabaseAdapter;

  class NtaAuthor extends Base {
    static {
      this._tableName = "nta_authors";
      this.attribute("name", "string");
    }
  }
  class NtaPost extends Base {
    static {
      this._tableName = "nta_posts";
      this.attribute("nta_author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class NtaTagging extends Base {
    static {
      this._tableName = "nta_taggings";
      this.attribute("taggable_id", "integer");
      this.attribute("taggable_type", "string");
      this.attribute("nta_tag_id", "integer");
    }
  }
  class NtaTag extends Base {
    static {
      this._tableName = "nta_tags";
      this.attribute("name", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    NtaAuthor.adapter = adapter;
    NtaPost.adapter = adapter;
    NtaTagging.adapter = adapter;
    NtaTag.adapter = adapter;
    registerModel("NtaAuthor", NtaAuthor);
    registerModel("NtaPost", NtaPost);
    registerModel("NtaTagging", NtaTagging);
    registerModel("NtaTag", NtaTag);
    (NtaAuthor as any)._associations = [];
    (NtaPost as any)._associations = [];
    (NtaTagging as any)._associations = [];
    (NtaTag as any)._associations = [];

    Associations.hasMany.call(NtaAuthor, "ntaPosts", {
      className: "NtaPost",
      foreignKey: "nta_author_id",
    });
    Associations.hasMany.call(NtaPost, "ntaTaggings", {
      className: "NtaTagging",
      foreignKey: "taggable_id",
    });
    Associations.belongsTo.call(NtaTagging, "ntaTag", {
      className: "NtaTag",
      foreignKey: "nta_tag_id",
    });

    // Direct through: Author → posts → taggings.
    Associations.hasMany.call(NtaAuthor, "ntaTaggings", {
      className: "NtaTagging",
      through: "ntaPosts",
      source: "ntaTaggings",
    });
    // Nested through: Author → (posts → taggings) → tags.
    Associations.hasMany.call(NtaAuthor, "ntaTags", {
      className: "NtaTag",
      through: "ntaTaggings",
      source: "ntaTag",
    });
    // Same nested-through but with `distinct` on the user scope —
    // mirrors Rails `has_many :distinct_subscribers, -> { distinct }`.
    Associations.hasMany.call(NtaAuthor, "ntaDistinctTags", {
      className: "NtaTag",
      through: "ntaTaggings",
      source: "ntaTag",
      scope: (rel: any) => rel.distinct(),
    });
  });

  async function seedSharedTag() {
    const author = await NtaAuthor.create({ name: "David" });
    const p1 = (await NtaPost.create({ nta_author_id: author.id, title: "p1" })) as any;
    const p2 = (await NtaPost.create({ nta_author_id: author.id, title: "p2" })) as any;
    const tag = (await NtaTag.create({ name: "general" })) as any;
    // Same tag attached via two distinct posts → distinct reflection
    // must dedupe to one tag row.
    await NtaTagging.create({
      taggable_id: p1.id,
      taggable_type: "NtaPost",
      nta_tag_id: tag.id,
    });
    await NtaTagging.create({
      taggable_id: p2.id,
      taggable_type: "NtaPost",
      nta_tag_id: tag.id,
    });
    return { author, p1, p2, tag };
  }

  it("distinct on the source-reflection scope returns one row when a tag is reachable via multiple posts", async () => {
    const { author, tag } = await seedSharedTag();
    const reflection = (NtaAuthor as any)._reflectOnAssociation("ntaDistinctTags");
    const tags = await loadHasManyThrough(author, "ntaDistinctTags", reflection.options);
    // Two taggings point to the same tag row via two different
    // posts. The user-provided `scope: rel.distinct()` must keep the
    // target row from duplicating in the chained result.
    expect(tags.map((t: any) => t.id)).toEqual([tag.id]);
    expect(tags.length).toBe(1);
  });

  it("preloading nested-through does not leak target rows between independent owner sets", async () => {
    const { author: a1 } = await seedSharedTag();
    const a2 = await NtaAuthor.create({ name: "other" });
    // a2 has its own post + its own tag — no overlap with a1.
    const op = (await NtaPost.create({ nta_author_id: a2.id, title: "op" })) as any;
    const otherTag = (await NtaTag.create({ name: "solo" })) as any;
    await NtaTagging.create({
      taggable_id: op.id,
      taggable_type: "NtaPost",
      nta_tag_id: otherTag.id,
    });

    const firstLoad = (await NtaAuthor.all()
      .where({ id: a1.id })
      .preload("ntaTags")
      .toArray()) as any[];
    const secondLoad = (await NtaAuthor.all()
      .where({ id: a2.id })
      .preload("ntaTags")
      .toArray()) as any[];

    const firstTags = firstLoad[0]._preloadedAssociations?.get("ntaTags") as any[];
    const secondTags = secondLoad[0]._preloadedAssociations?.get("ntaTags") as any[];
    // Source-reflection state from the first preload must not bleed
    // into the second (Rails-equivalent of the "reset source
    // reflection after loading" guarantee).
    expect(firstTags.every((t: any) => t.name === "general")).toBe(true);
    expect(secondTags.map((t: any) => t.name)).toEqual(["solo"]);
  });

  it("table referenced multiple times in the nested chain aliases consistently across loads", async () => {
    // Author → ntaPosts → ntaTaggings: the same NtaPost table appears
    // both as the direct through (ntaPosts) and as the polymorphic
    // taggable of ntaTaggings. Two separate loads on the same chain
    // must produce stable IDs (no alias collision across invocations).
    const { author } = await seedSharedTag();
    const taggings1 = (await NtaAuthor.all()
      .where({ id: author.id })
      .preload("ntaTaggings")
      .toArray()) as any[];
    const taggings2 = (await NtaAuthor.all()
      .where({ id: author.id })
      .preload("ntaTaggings")
      .toArray()) as any[];
    const t1 = (taggings1[0]._preloadedAssociations?.get("ntaTaggings") ?? []) as any[];
    const t2 = (taggings2[0]._preloadedAssociations?.get("ntaTaggings") ?? []) as any[];
    expect(t1.map((r: any) => r.id).sort()).toEqual(t2.map((r: any) => r.id).sort());
    expect(t1.length).toBe(2);
  });

  it("through with polymorphic source + sourceType filters cross-type targets out of the result", async () => {
    // Hotel → chefs → employable (polymorphic). The polymorphic
    // source reflection plus `sourceType: NseCakeDesigner` must
    // select only the cake chef row even when a drink chef shares
    // the same chefs table. Mirrors the source-type axis of
    // test_has_many_through_polymorphic_with_scope; the user-scope
    // axis is exercised in the source-condition cases above.
    class NseHotel extends Base {
      static {
        this._tableName = "nse_hotels";
        this.attribute("name", "string");
      }
    }
    class NseChef extends Base {
      static {
        this._tableName = "nse_chefs";
        this.attribute("nse_hotel_id", "integer");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
      }
    }
    class NseCakeDesigner extends Base {
      static {
        this._tableName = "nse_cake_designers";
        this.attribute("name", "string");
      }
    }
    class NseDrinkDesigner extends Base {
      static {
        this._tableName = "nse_drink_designers";
        this.attribute("name", "string");
      }
    }
    [NseHotel, NseChef, NseCakeDesigner, NseDrinkDesigner].forEach((m) => {
      m.adapter = adapter;
      (m as any)._associations = [];
    });
    registerModel("NseHotel", NseHotel);
    registerModel("NseChef", NseChef);
    registerModel("NseCakeDesigner", NseCakeDesigner);
    registerModel("NseDrinkDesigner", NseDrinkDesigner);

    Associations.hasMany.call(NseHotel, "nseChefs", {
      className: "NseChef",
      foreignKey: "nse_hotel_id",
    });
    Associations.belongsTo.call(NseChef, "employable", {
      polymorphic: true,
      foreignKey: "employable_id",
    });
    Associations.hasMany.call(NseHotel, "cakeDesigners", {
      className: "NseCakeDesigner",
      through: "nseChefs",
      source: "employable",
      sourceType: "NseCakeDesigner",
    });

    const cake = (await NseCakeDesigner.create({ name: "Cake Boss" })) as any;
    const drink = (await NseDrinkDesigner.create({ name: "Mixer" })) as any;
    const hotel = (await NseHotel.create({ name: "Grand" })) as any;
    await NseChef.create({
      nse_hotel_id: hotel.id,
      employable_id: cake.id,
      employable_type: "NseCakeDesigner",
    });
    await NseChef.create({
      nse_hotel_id: hotel.id,
      employable_id: drink.id,
      employable_type: "NseDrinkDesigner",
    });

    const reflection = (NseHotel as any)._reflectOnAssociation("cakeDesigners");
    const designers = await loadHasManyThrough(hotel, "cakeDesigners", reflection.options);
    expect(designers.length).toBe(1);
    expect((designers[0] as any).id).toBe(cake.id);
  });

  it("preloading two independent author sets keeps each owner's nested-through targets isolated", async () => {
    // Mirrors the second half of test_has_many_through_reset_source_-
    // reflection_after_loading_is_complete: independently preloaded
    // collections (here, queried by disjoint id sets) must yield
    // tags rooted at their own owners — the source-reflection cache
    // must not bind to the first owner set.
    const { author: david } = await seedSharedTag();
    const mary = await NtaAuthor.create({ name: "Mary" });
    const mp = (await NtaPost.create({ nta_author_id: mary.id, title: "mp" })) as any;
    const otherTag = (await NtaTag.create({ name: "solo" })) as any;
    await NtaTagging.create({
      taggable_id: mp.id,
      taggable_type: "NtaPost",
      nta_tag_id: otherTag.id,
    });

    const preloaded = (await NtaAuthor.all().preload("ntaTags").toArray()) as any[];
    const byId = new Map(preloaded.map((row: any) => [row.id, row]));
    const davidTags = byId.get(david.id)!._preloadedAssociations.get("ntaTags") as any[];
    const maryTags = byId.get(mary.id)!._preloadedAssociations.get("ntaTags") as any[];
    expect(davidTags.every((t: any) => t.name === "general")).toBe(true);
    expect(maryTags.map((t: any) => t.name)).toEqual(["solo"]);
  });

  it("nested-through must not autosave: reading the proxy after save inserts nothing", async () => {
    const { author } = await seedSharedTag();
    const before = await NtaTagging.all().toArray();
    // Re-save the owner and re-read the nested-through proxy: nothing
    // on the through chain should be re-inserted or duplicated.
    await author.save();
    const reflection = (NtaAuthor as any)._reflectOnAssociation("ntaTags");
    const tags = await loadHasManyThrough(author, "ntaTags", reflection.options);
    // Two taggings point at the same tag, so the chained source
    // query (WHERE id IN (...)) returns one row — but the through
    // side must remain untouched: no extra taggings written, no
    // existing taggings dropped.
    expect(tags.length).toBe(1);
    const after = await NtaTagging.all().toArray();
    expect(after.length).toBe(before.length);
  });
});
