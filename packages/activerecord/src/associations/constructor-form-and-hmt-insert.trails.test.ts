import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";

registerModel(Author);
registerModel(Post);
registerModel(Tag);
registerModel(Tagging);

const { posts } = fixtures(["posts"]);

describe("constructor-form association writer", () => {
  it("dispatches array values to hasMany association on construction", () => {
    const p1 = new Post({ title: "a" });
    const p2 = new Post({ title: "b" });
    const author = new Author({ name: "Acme", posts: [p1, p2] });
    const target = (author as any).association("posts").target;
    expect(target).toHaveLength(2);
    expect(target[0]).toBe(p1);
    expect(target[1]).toBe(p2);
  });

  it("dispatches alongside plain attributes in the same constructor bag", () => {
    const p1 = new Post({ title: "a" });
    const author = new Author({ name: "Acme", posts: [p1] });
    expect((author as any).readAttribute("name")).toBe("Acme");
    expect((author as any).association("posts").target).toEqual([p1]);
  });

  it("dispatches alongside a multiparameter key in the same constructor bag", () => {
    const p1 = new Post({ title: "a" });
    const author = new Author({ posts: [p1], "name(1)": "x" });
    expect((author as any).association("posts").target).toEqual([p1]);
  });

  it("routes an association key reached through setAttributes", async () => {
    const author = new Author();
    const post = new Post({ title: "a" });
    await author.setAttributes({ posts: [post] });
    expect((author as any).association("posts").target).toContain(post);
  });

  it("dispatches single record to hasOne association on construction", () => {
    const p = new Post({ title: "p" });
    const author = new Author({ name: "x", post: p });
    expect((author as any).association("post").target).toBe(p);
  });
});

describe("HABTM insert_record two-step", () => {
  it("super.insertRecord saves the target, save_through_record persists join row", async () => {
    const post = posts("welcome");
    const tag = new Tag({ name: "ruby" });
    const ok = await (post as any).association("tags").insertRecord(tag, true, false);
    expect(ok).toBe(true);
    expect(tag.isPersisted()).toBe(true);
    const reloaded = await Post.find(post.id);
    const tags = await (reloaded as any).association("tags").loadTarget();
    expect(tags).toHaveLength(1);
    expect(tags[0].id).toBe(tag.id);
  });
});

describe("resetScope on owner save", () => {
  it("clears the memoized association scope before iterating children", async () => {
    const author = await Author.create({ name: "o" });
    const assoc = (author as any).association("posts");
    let resetCount = 0;
    const original = assoc.resetScope.bind(assoc);
    assoc.resetScope = function () {
      resetCount++;
      return original();
    };
    (author as any).posts.build({ title: "t", body: "b" });
    await author.save();
    expect(resetCount).toBeGreaterThan(0);
  });

  it("clears the scope of a built association that never loaded a target", async () => {
    const author = new Author({ name: "unloaded" });
    const assoc = (author as any).association("posts");
    let resetCount = 0;
    const original = assoc.resetScope.bind(assoc);
    assoc.resetScope = function () {
      resetCount++;
      return original();
    };
    assoc.scope();
    await author.save();
    expect(resetCount).toBeGreaterThan(0);
    expect(assoc.scope().toSql()).toContain(String(author.id));
  });
});
