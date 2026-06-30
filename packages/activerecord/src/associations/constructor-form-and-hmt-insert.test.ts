/**
 * HMT Slot C smoke tests:
 *   - constructor-form collection writer in assignAttributes
 *   - association.resetScope invocation during saveCollectionAssociation
 *   - has_many :through insert_record two-step alignment
 *     (super.insertRecord → save_through_record)
 *
 * No 1:1 Rails counterpart — a trails-internal harness for the
 * constructor-form / through-insert write path. Rides the canonical schema
 * (`Author has_many :posts`/`has_one :post`, `Post has_many :tags, through:
 * :taggings`) + fixtures; no inline tables and no `defineSchema`.
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
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

  it("dispatches via assignAttributes (manual-call path, non-multiparameter)", () => {
    const author = new Author();
    const p1 = new Post({ title: "a" });
    author.assignAttributes({ name: "Acme", posts: [p1] });
    expect((author as any).readAttribute("name")).toBe("Acme");
    expect((author as any).association("posts").target).toEqual([p1]);
  });

  it("dispatches via assignAttributes (multiparameter branch)", () => {
    const author = new Author();
    const p1 = new Post({ title: "a" });
    // Mix in a multiparameter key so assignAttributes takes the
    // hasMultiparameterKeys branch — association routing must still happen.
    author.assignAttributes({
      posts: [p1],
      // Force the multiparameter branch via a parenthesized key —
      // value content is irrelevant; we only care that `posts` still
      // routes through assignAssociationIfMatch in this branch.
      "name(1)": "x",
    });
    expect((author as any).association("posts").target).toEqual([p1]);
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
    // super.insertRecord saved the target
    expect(tag.isPersisted()).toBe(true);
    // Reload to force a fresh through-load from the DB so we know the join
    // row was actually persisted (rather than just cached in the in-memory
    // proxy from build()).
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
    // saveCollectionAssociation must call resetScope() before iterating
    // children so a stale scope doesn't survive into per-child saves.
    let resetCount = 0;
    const original = assoc.resetScope.bind(assoc);
    assoc.resetScope = function () {
      resetCount++;
      return original();
    };
    (author as any).posts = [];
    await author.save();
    expect(resetCount).toBeGreaterThan(0);
  });
});
