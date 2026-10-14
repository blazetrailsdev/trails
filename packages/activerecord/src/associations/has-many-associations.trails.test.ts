import { kernelThrow } from "@blazetrails/ruby-compat";
import { describe, it, expect, vi } from "vitest";
import { Base, RecordNotDestroyed, registerModel } from "../index.js";
import type { AssociationProxy } from "./collection-proxy.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Client, Firm } from "../test-helpers/models/company.js";
import { CpkBook, CpkOrder } from "../test-helpers/models/cpk.js";

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies", "authors", "posts", "comments", "cpkBooks"]);

  it("adding buffers a record whose save fails into the target", async () => {
    const bad = new Client({ name: "Bad" });
    bad.throwOnSave = true;

    const firstFirm = companies("first_firm") as Firm;
    await firstFirm.clientsOfFirm.load();
    await firstFirm.clientsOfFirm.concat(bad);

    expect(await firstFirm.clientsOfFirm).toContain(bad);
    const reloaded = await firstFirm.clientsOfFirm.reload();
    expect(reloaded).not.toContain(bad);
  });

  it("creating a record whose save fails buffers it into the target", async () => {
    const firstFirm = companies("first_firm") as Firm;
    await firstFirm.clientsOfFirm.load();

    const saveSpy = vi.spyOn(Client.prototype, "save").mockResolvedValue(false);
    let bad: Client;
    try {
      bad = await firstFirm.clientsOfFirm.create({ name: "Bad" });
    } finally {
      saveSpy.mockRestore();
    }

    expect(bad.isNewRecord()).toBe(true);
    expect(await firstFirm.clientsOfFirm).toContain(bad);
    const reloaded = await firstFirm.clientsOfFirm.reload();
    expect(reloaded).not.toContain(bad);
  });

  it("deleting composite-key records scopes by tuple, not cartesian product", async () => {
    registerModel([CpkOrder, CpkBook]);
    const order = await CpkOrder.create({ shop_id: 1, status: "open" });
    const orderId = order.readAttribute("id");
    const mk = (authorId: number, id: number) =>
      CpkBook.create({ id: [authorId, id], order, title: `b${authorId}-${id}` });
    const b1 = await mk(1, 10);
    const b2 = await mk(2, 20);
    await mk(1, 20);
    await mk(2, 10);

    await order.books.delete(b1, b2);

    const survivor1 = await CpkBook.findBy({ author_id: 1, id: 20 });
    const survivor2 = await CpkBook.findBy({ author_id: 2, id: 10 });
    expect(survivor1!.order_id).toBe(Number(orderId));
    expect(survivor2!.order_id).toBe(Number(orderId));
    const deleted1 = await CpkBook.findBy({ author_id: 1, id: 10 });
    const deleted2 = await CpkBook.findBy({ author_id: 2, id: 20 });
    expect(deleted1!.order_id).toBeNull();
    expect(deleted2!.order_id).toBeNull();
  });

  it("destroy returns the removed records", async () => {
    const firstFirm = companies("first_firm") as Firm;
    const first = (await firstFirm.clientsOfFirm.first())!;
    const removed = await firstFirm.clientsOfFirm.destroy(first);
    expect(removed!.map((r) => r.id)).toEqual([first.id]);
  });

  it("isAssociationCached reflects built Association instances", async () => {
    class CacheAuthor extends Base {
      declare name: string | null;
      declare cache_posts: AssociationProxy<CachePost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("cache_posts", {
          className: "CachePost",
          foreignKey: "cache_author_id",
        });
      }
    }
    class CachePost extends Base {
      declare cache_author_id: number | null;

      static {
        this.attribute("cache_author_id", "integer");
      }
    }
    registerModel(CacheAuthor);
    registerModel(CachePost);
    const author = await CacheAuthor.create({ name: "Alice" });

    expect(author.isAssociationCached("cache_posts")).toBe(false);

    void author.cache_posts;
    expect(author.isAssociationCached("cache_posts")).toBe(true);
    expect(author.isAssociationCached("other")).toBe(false);
  });

  it("collection destroy uses destroy bang and rolls back the batch on failure", async () => {
    class HaltingComment extends Base {
      declare body: string | null;

      static {
        this._tableName = "comments";
        this.attribute("body", "string");
        this.beforeDestroy(function (this: HaltingComment) {
          if (this._readAttribute("body") === "keep") kernelThrow(":abort");
        });
      }
    }
    class PostWithHaltingComments extends Base {
      declare title: string | null;
      declare body: string | null;
      declare haltingComments: AssociationProxy<HaltingComment>;

      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.hasMany("haltingComments", {
          className: "HaltingComment",
          foreignKey: "post_id",
          dependent: "destroy",
        });
      }
    }
    registerModel(PostWithHaltingComments);
    registerModel(HaltingComment);
    const post = await PostWithHaltingComments.create({ title: "T", body: "b" });
    const first = await HaltingComment.create({ post_id: post.id, body: "removable" });
    const second = await HaltingComment.create({ post_id: post.id, body: "keep" });

    await expect(post.haltingComments.destroy(first, second)).rejects.toBeInstanceOf(
      RecordNotDestroyed,
    );

    expect(await HaltingComment.isExists(first.id)).toBe(true);
    expect(await HaltingComment.isExists(second.id)).toBe(true);
  });
});
