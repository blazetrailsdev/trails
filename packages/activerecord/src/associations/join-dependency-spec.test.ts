/**
 * Covers JoinDependency#addAssociationSpec — the recursive entry point that
 * routes nested eager_load specs (hashes, dotted strings, arrays) into the
 * JOIN tree instead of degrading them to preload. Verifies shared-prefix
 * deduplication and all-or-nothing rollback on unjoinable segments.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency#build (recursive tree
 * construction from the eager_load values hash).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { clearReflectionsCache } from "../reflection.js";
import { JoinDependency } from "./join-dependency.js";

describe("JoinDependency#addAssociationSpec", () => {
  let adapter: any;

  class Post extends Base {
    static {
      this.attribute("title", "string");
    }
  }

  class Comment extends Base {
    static {
      this.attribute("post_id", "integer");
      this.attribute("author_id", "integer");
      this.attribute("body", "string");
    }
  }

  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Tag extends Base {
    static {
      this.attribute("comment_id", "integer");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    for (const m of [Post, Comment, Author, Tag]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      (m as any)._reflections = {};
      clearReflectionsCache(m);
      registerModel(m);
    }
    Post.hasMany("comments", { className: "Comment" });
    Comment.belongsTo("author", { className: "Author" });
    Comment.hasMany("tags", { className: "Tag" });
  });

  const paths = (jd: JoinDependency) => jd.nodes.map((n) => n.assocName).sort();

  it("joins a nested hash spec instead of falling back to preload", () => {
    const jd = new JoinDependency(Post);
    expect(jd.addAssociationSpec({ comments: "author" })).toBe(true);
    expect(paths(jd)).toEqual(["comments", "comments.author"]);
  });

  it("joins a dotted-string spec", () => {
    const jd = new JoinDependency(Post);
    expect(jd.addAssociationSpec("comments.author")).toBe(true);
    expect(paths(jd)).toEqual(["comments", "comments.author"]);
  });

  it("deduplicates shared prefixes across hash array values", () => {
    const jd = new JoinDependency(Post);
    expect(jd.addAssociationSpec({ comments: ["author", "tags"] })).toBe(true);
    expect(paths(jd)).toEqual(["comments", "comments.author", "comments.tags"]);
  });

  it("deduplicates shared prefixes across separate spec calls", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociationSpec("comments.author");
    jd.addAssociationSpec("comments.tags");
    expect(paths(jd)).toEqual(["comments", "comments.author", "comments.tags"]);
  });

  it("rolls back the whole spec when a segment can't be joined", () => {
    const jd = new JoinDependency(Post);
    expect(jd.addAssociationSpec({ comments: "nonExisting" })).toBe(false);
    expect(jd.nodes).toHaveLength(0);
  });
});
