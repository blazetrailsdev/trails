import type { CollectionAssociation } from "./collection-association.js";
import { kernelThrow } from "@blazetrails/ruby-compat";
import { describe, it, expect } from "vitest";
import { Base, registerModel } from "../index.js";
import type { Base as BaseRecord } from "../base.js";

import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";

registerModel(Author);
registerModel(Post);

describe("association callbacks — object callbacks (trails)", () => {
  fixtures({});

  it("dispatches the callback kind as a method on an object callback", async () => {
    const log: string[] = [];
    const auditor = {
      beforeAdd(_owner: BaseRecord, record: BaseRecord) {
        log.push(`beforeAdd:${(record as unknown as { title: string }).title}`);
      },
      afterAdd(_owner: BaseRecord, record: BaseRecord) {
        log.push(`afterAdd:${(record as unknown as { title: string }).title}`);
      },
    };

    class ObjectCbAuthor extends Base {
      static {
        this.tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("posts", {
          className: "Post",
          foreignKey: "author_id",
          beforeAdd: auditor,
          afterAdd: auditor,
        });
      }
    }
    registerModel("ObjectCbAuthor", ObjectCbAuthor);

    const author = await ObjectCbAuthor.create({ name: "David" });
    const proxy = (author.association("posts") as CollectionAssociation).reader;
    await proxy.push(new Post({ title: "Hello", body: "Body", author_id: author.id }));

    expect(log).toEqual(["beforeAdd:Hello", "afterAdd:Hello"]);
  });
});

let cbIdx = 0;

function makeAuthorWithCallbacks(
  callbacks: Record<string, (owner: BaseRecord, record: BaseRecord) => void>,
) {
  const idx = ++cbIdx;
  class CbAuthor extends Base {
    static {
      this.tableName = "authors";
      this.attribute("name", "string");
      this.hasMany("posts", {
        className: "Post",
        foreignKey: "author_id",
        ...callbacks,
      });
    }
  }
  registerModel(`TrailsAuthorWithCallbacks${idx}`, CbAuthor);
  return { Author: CbAuthor, Post };
}

describe("AssociationCallbacksTest", () => {
  fixtures({});

  it("before add abort prevents create from saving", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeAdd: () => kernelThrow(":abort"),
    });
    const author = await Author.create({ name: "David" });
    const proxy = (author.association("posts") as CollectionAssociation).reader;
    const p = await proxy.create({ title: "Blocked", body: "Body" });
    expect(p.isNewRecord()).toBe(true);
    const all = await Post.where({ author_id: author.id });
    expect(all.length).toBe(0);
  });

  it("before_remove abort halts the whole removal, not just the current record", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({
      beforeRemove: (_owner: BaseRecord, record: BaseRecord) => {
        if ((record as Post).title === "keep") kernelThrow(":abort");
      },
    });
    const author = await Author.create({ name: "David" });
    const p1 = await Post.create({
      title: "removable",
      body: "Body",
      author_id: author.id,
    });
    const p2 = await Post.create({ title: "keep", body: "Body", author_id: author.id });
    const proxy = (author.association("posts") as CollectionAssociation).reader;
    expect((await proxy).length).toBe(2);
    await proxy.delete(p1, p2);
    expect((await proxy).length).toBe(2);
  });

  it("after_add callback throwing abort propagates (not swallowed)", async () => {
    const { Author, Post } = makeAuthorWithCallbacks({
      afterAdd: () => kernelThrow(":abort"),
    });
    const author = await Author.create({ name: "David" });
    const proxy = (author.association("posts") as CollectionAssociation).reader;
    const p = new Post({ title: "abc", body: "Body", author_id: author.id });
    await expect(proxy.push(p)).rejects.toBeDefined();
  });
});
