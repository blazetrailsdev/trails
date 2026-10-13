import { describe, it, expect } from "vitest";
import { Base, registerModel, RecordInvalid } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { quoteTableName } from "../support/quote-regex.js";
import { Author } from "../test-helpers/models/author.js";
import { Category } from "../test-helpers/models/category.js";
import {
  CpkBook,
  CpkBookWithOrderAgreements,
  CpkChapter,
  CpkOrder,
  CpkOrderAgreement,
  CpkOrderTag,
  CpkOrderWithSingularBookChapters,
  CpkTag,
} from "../test-helpers/models/cpk.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Person } from "../test-helpers/models/person.js";
import { Post } from "../test-helpers/models/post.js";
import { Reader } from "../test-helpers/models/reader.js";
import { ShardedBlogPost } from "../test-helpers/models/sharded/blog-post.js";
import { ShardedBlogPostTag } from "../test-helpers/models/sharded/blog-post-tag.js";
import { ShardedTag } from "../test-helpers/models/sharded/tag.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import type { CollectionAssociation } from "./collection-association.js";
import type { AssociationProxy } from "./collection-proxy.js";

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

  registerModel([
    Tag,
    Tagging,
    Category,
    Essay,
    Post,
    Author,
    Person,
    Reader,
    ShardedBlogPost,
    ShardedTag,
    ShardedBlogPostTag,
    CpkTag,
    CpkOrder,
    CpkOrderTag,
    CpkBook,
    CpkBookWithOrderAgreements,
    CpkOrderAgreement,
    CpkOrderWithSingularBookChapters,
    CpkChapter,
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
    const orderAgreementsFk = quoteTableName("cpk_order_agreements.order_id");
    const orderId = quoteTableName("cpk_orders.id");
    const orderShopId = quoteTableName("cpk_orders.shop_id");
    expect(sql).toMatch(new RegExp(`INNER JOIN ${quoteTableName("cpk_orders")}`, "i"));
    expect(sql).toMatch(new RegExp(`${orderAgreementsFk} = ${orderId}`, "i"));
    expect(sql).toMatch(new RegExp(`${orderShopId} =`, "i"));
    expect(sql).toMatch(new RegExp(`${orderId} =`, "i"));

    expect(await book.orderAgreements).toEqual([agreement]);
  });

  it("composite-pk target and through model has_many through routes via join scope", async () => {
    const tag = cpkTags("cpk_tag_loyal_customer");
    const sql = await tag.orders.toSql();
    const ordersId = quoteTableName("cpk_orders.id");
    const orderTagsOrderId = quoteTableName("cpk_order_tags.order_id");
    const orderTagsTagId = quoteTableName("cpk_order_tags.tag_id");
    expect(sql).toMatch(new RegExp(`INNER JOIN ${quoteTableName("cpk_order_tags")}`, "i"));
    expect(sql).toMatch(new RegExp(`${ordersId} = ${orderTagsOrderId}`, "i"));
    expect(sql).toMatch(new RegExp(`${orderTagsTagId} =`, "i"));

    expect((await tag.orders).length).toBeGreaterThan(0);
  });

  it("composite source fk has_many through routes via join scope", async () => {
    const order = await CpkOrderWithSingularBookChapters.create({ id: [5, 6] });
    await order.association("book").create({ id: [7, 8] });

    const sql = await order.chapters.toSql();
    const chapAuthorId = quoteTableName("cpk_chapters.author_id");
    const chapBookId = quoteTableName("cpk_chapters.book_id");
    const bookAuthorId = quoteTableName("cpk_books.author_id");
    const bookId = quoteTableName("cpk_books.id");
    expect(sql).toMatch(new RegExp(`${chapAuthorId} = ${bookAuthorId}`, "i"));
    expect(sql).toMatch(new RegExp(`${chapBookId} = ${bookId}`, "i"));
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class IrpvTagging extends Base {
      declare taggable_id: number | null;
      declare taggable_type: string | null;
      declare tag_id: number | null;

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface IrpvTagging {
      get tag(): Tag | null | Promise<Tag | null>;
      set tag(value: Tag | null);
    }
    registerModel("IrpvTagging", IrpvTagging);

    const post = await Post.create({ title: "Test", body: "" });
    const tag = await Tag.create({ name: "testjoin" });

    class IrpvPost extends Base {
      declare title: string | null;
      declare body: string | null;
      declare irpvTaggings: AssociationProxy<IrpvTagging>;
      declare irpvTags: AssociationProxy<Base>;

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
