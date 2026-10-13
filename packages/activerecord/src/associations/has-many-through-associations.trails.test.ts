import { describe, it, expect } from "vitest";
import { Base, registerModel, RecordInvalid } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { quoteTableName } from "../support/quote-regex.js";
import { Author } from "../test-helpers/models/author.js";
import {
  CpkBookWithOrderAgreements,
  CpkOrder,
  CpkOrderAgreement,
  CpkOrderTag,
  CpkOrderWithSingularBookChapters,
} from "../test-helpers/models/cpk.js";
import { Person } from "../test-helpers/models/person.js";
import { Post } from "../test-helpers/models/post.js";
import { ShardedBlogPost } from "../test-helpers/models/sharded/blog-post.js";
import { Tag } from "../test-helpers/models/tag.js";
import type { CollectionAssociation } from "./collection-association.js";

describe("HasManyThroughAssociationsTest", () => {
  const { posts, people, authors, categories, shardedBlogPosts, cpkTags } = fixtures([
    "posts",
    "readers",
    "people",
    "authors",
    "categories",
    "essays",
    "taggings",
    "tags",
    "shardedBlogPosts",
    "shardedTags",
    "shardedBlogPostsTags",
    "cpkTags",
    "cpkOrders",
    "cpkOrderTags",
  ]);

  it("associating a persisted record with unsaved changes saves those changes", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("michael").id);
    person.writeAttribute("first_name", "Bongo");

    await (post.association("people") as CollectionAssociation).concat(person);

    await person.reload();
    expect(person.readAttribute("first_name")).toBe("Bongo");
  });

  it("pushing a persisted record with unsaved changes saves those changes", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("michael").id);
    person.writeAttribute("first_name", "Bongo");

    await post.people.push(person);

    await person.reload();
    expect(person.readAttribute("first_name")).toBe("Bongo");
  });

  it("appends a composite-pk target record through a join model", async () => {
    const order = await CpkOrder.create({ shop_id: 1, status: "open" });
    const tag = cpkTags("cpk_tag_loyal_customer");
    await tag.orders.push(order);
    const joinRow = await CpkOrderTag.findBy({
      order_id: order.readAttribute("id_value"),
      tag_id: tag.id,
    });
    expect(joinRow).not.toBeNull();
    await tag.orders.reload();
    const orders = await tag.orders;
    expect(orders.map((o) => Number(o.readAttribute("id_value")))).toContain(
      Number(order.readAttribute("id_value")),
    );
  });

  it("composite through-key has_many through routes via join scope", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const book = await CpkBookWithOrderAgreements.create({ id: [1, 2] });
    book.order = order;
    await book.save();
    const agreement = await CpkOrderAgreement.create({ order_id: order.readAttribute("id_value") });

    const sql = await book.orderAgreements.toSql();
    const orderId = quoteTableName("cpk_orders.id");
    expect(sql).toMatch(new RegExp(`INNER JOIN ${quoteTableName("cpk_orders")}`, "i"));
    expect(sql).toMatch(
      new RegExp(`${quoteTableName("cpk_order_agreements.order_id")} = ${orderId}`, "i"),
    );
    expect(sql).toMatch(new RegExp(`${quoteTableName("cpk_orders.shop_id")} =`, "i"));
    expect(sql).toMatch(new RegExp(`${orderId} =`, "i"));

    expect(await book.orderAgreements).toEqual([agreement]);
  });

  it("composite-pk target and through model has_many through routes via join scope", async () => {
    const tag = cpkTags("cpk_tag_loyal_customer");
    const sql = await tag.orders.toSql();
    const q = quoteTableName;
    expect(sql).toMatch(new RegExp(`INNER JOIN ${q("cpk_order_tags")}`, "i"));
    expect(sql).toMatch(new RegExp(`${q("cpk_orders.id")} = ${q("cpk_order_tags.order_id")}`, "i"));
    expect(sql).toMatch(new RegExp(`${q("cpk_order_tags.tag_id")} =`, "i"));

    expect((await tag.orders).length).toBeGreaterThan(0);
  });

  it("composite source fk has_many through routes via join scope", async () => {
    const order = await CpkOrderWithSingularBookChapters.create({ id: [5, 6] });
    await order.association("book").create({ id: [7, 8] });

    const sql = await order.chapters.toSql();
    const q = quoteTableName;
    expect(sql).toMatch(
      new RegExp(`${q("cpk_chapters.author_id")} = ${q("cpk_books.author_id")}`, "i"),
    );
    expect(sql).toMatch(new RegExp(`${q("cpk_chapters.book_id")} = ${q("cpk_books.id")}`, "i"));
    await expect(order.chapters.toArray()).resolves.toBeInstanceOf(Array);
  });

  it("collection singular ids getter through with custom primary key", async () => {
    const david = await Author.find(authors("david").id);
    const catIds = await (
      david.association("essayCategories") as CollectionAssociation
    ).idsReader();
    expect([...catIds].sort()).toEqual([categories("general").name]);
  });

  it("through association resolves composite source association primary key", async () => {
    const blogPost = await ShardedBlogPost.find(shardedBlogPosts("great_post_blog_one").id);
    const tags = await blogPost.tags;
    expect(tags.length).toBeGreaterThan(0);
    const tag = tags[0];

    await blogPost.tags.delete(tag);
    await blogPost.tags.reload();
    const remaining = await blogPost.tags;
    expect(remaining.map((t) => Number(t.id))).not.toContain(Number(tag.id));
  });

  it("insertRecord with validate false still raises on invalid join record", async () => {
    class IrpvTagging extends Base {
      static {
        this._tableName = "taggings";
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.attribute("tag_id", "integer");
        this.validate((r: IrpvTagging) => {
          r.errors.add("base", "Join always invalid");
        });
        this.belongsTo("tag", { className: "Tag", foreignKey: "tag_id" });
      }
    }
    registerModel("IrpvTagging", IrpvTagging);

    const post = await Post.create({ title: "Test", body: "" });
    const tag = await Tag.create({ name: "testjoin" });

    class IrpvPost extends Base {
      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.hasMany("irpvTaggings", { className: "IrpvTagging", foreignKey: "taggable_id" });
        this.hasMany("irpvTags", { through: "irpvTaggings", source: "tag", className: "Tag" });
      }
    }
    registerModel("IrpvPost", IrpvPost);

    const irpvPost = await IrpvPost.find(post.id);
    const assoc = irpvPost.association("irpvTags") as CollectionAssociation;
    await expect(assoc.insertRecord(tag, false, false)).rejects.toThrow(RecordInvalid);
    expect(await IrpvTagging.where({ taggable_id: post.id }).count()).toBe(0);
  });

  it("loads through a join model", async () => {
    const post = await Post.find(posts("welcome").id);
    expect((await post.tags).length).toBeGreaterThan(0);

    const postTags2 = await Post.joins(":tags").where({ id: post.id });
    expect(postTags2.length).toBeGreaterThan(0);
    expect(postTags2).toContainEqual(post);
  });
});
