import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { CollectionProxy } from "./collection-proxy.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

registerModel(Author);
registerModel(Post);
registerModel(Comment);

describe("CollectionProxy scope delegation matches QueryMethods", () => {
  const { authors, posts } = fixtures(["authors", "posts", "comments"]);

  it("delegates the public QueryMethods aliases to scope", () => {
    for (const name of ["leftJoins", "without"]) {
      expect(Object.hasOwn(CollectionProxy.prototype, name)).toBe(true);
    }
  });

  it("delegates the QueryMethods bang builders to scope", () => {
    expect(Object.hasOwn(CollectionProxy.prototype, "_selectBang")).toBe(true);
  });

  it("_selectBang runs against the association scope", async () => {
    const author = await Author.find(authors("david").id);
    const proxy = author.posts as unknown as {
      _selectBang(column: string): { selectValues: string[] };
      resetScope(): unknown;
      selectValues: string[];
    };
    const relation = proxy._selectBang("id");

    expect(relation.selectValues).toEqual(["id"]);
    proxy.resetScope();
    expect(proxy.selectValues).toEqual([]);
  });

  it("delegates no name QueryMethods does not define", () => {
    for (const name of ["nullBang", "rewhereBang", "selectBang"]) {
      expect(Object.hasOwn(CollectionProxy.prototype, name)).toBe(false);
    }
  });

  const id = (record: { id: unknown }) => String(record.id);

  it("leftJoins runs against the association scope", async () => {
    const author = await Author.find(authors("david").id);
    const scoped = new Set((await author.posts).map(id));
    const relation = author.posts.leftJoins(":comments");
    const records = await relation;

    expect(scoped.size).toBeGreaterThan(0);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((post: Post) => scoped.has(id(post)))).toBe(true);
    expect(relation.toSql().toLowerCase()).toContain("left outer join");
  });

  it("without runs against the association scope", async () => {
    const author = await Author.find(authors("david").id);
    const excluded = posts("welcome");
    const scoped = new Set((await author.posts).map(id));
    const records = await author.posts.without(excluded);

    expect(scoped.has(id(excluded))).toBe(true);
    expect(records.length).toBeGreaterThan(0);
    expect(records.map(id)).not.toContain(id(excluded));
    expect(records.every((post: Post) => scoped.has(id(post)))).toBe(true);
  });
});
