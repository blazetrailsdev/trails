/**
 * Covers JoinDependency#build — the recursive tree construction the constructor
 * runs, which routes nested eager_load specs (hashes, dotted strings, arrays)
 * into the JOIN tree instead of degrading them to preload. Verifies
 * shared-prefix deduplication and all-or-nothing rollback on unjoinable
 * segments (the latter a trails-only fallback lane; Rails raises).
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency#build (recursive tree
 * construction from the eager_load values hash).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { clearReflectionsCache } from "../reflection.js";
import { fixtures } from "../test-fixtures.js";
import { JoinDependency } from "./join-dependency.js";
import { Nodes } from "@blazetrails/arel";
import type { AssociationSpec } from "../relation/query-methods.js";

describe("JoinDependency#build", () => {
  // Ride the boot-laid canonical `Base.connection` (single-pool test model)
  // rather than a sidecar `_pool` lease; these wiring tests only need an
  // adapter for JoinDependency's quoting, not a bespoke schema.
  fixtures({});

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
    for (const m of [Post, Comment, Author, Tag]) {
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

  /** Build the way the eager-load paths do: un-joinable specs land in `fallback`. */
  const buildEager = (spec: AssociationSpec | AssociationSpec[]) => {
    const fallback: AssociationSpec[] = [];
    const jd = new JoinDependency(Post, null, spec, Nodes.OuterJoin, fallback);
    return { jd, fallback };
  };

  it("joins a nested hash spec instead of falling back to preload", () => {
    const { jd, fallback } = buildEager({ comments: "author" });
    expect(fallback).toEqual([]);
    expect(paths(jd)).toEqual(["comments", "comments.author"]);
  });

  it("joins a dotted-string spec", () => {
    const { jd, fallback } = buildEager("comments.author");
    expect(fallback).toEqual([]);
    expect(paths(jd)).toEqual(["comments", "comments.author"]);
  });

  it("deduplicates shared prefixes across hash array values", () => {
    const { jd, fallback } = buildEager({ comments: ["author", "tags"] });
    expect(fallback).toEqual([]);
    expect(paths(jd)).toEqual(["comments", "comments.author", "comments.tags"]);
  });

  it("deduplicates shared prefixes across separate spec calls", () => {
    const { jd } = buildEager(["comments.author", "comments.tags"]);
    expect(paths(jd)).toEqual(["comments", "comments.author", "comments.tags"]);
  });

  it("rolls back the whole spec when a segment can't be joined", () => {
    const spec = { comments: "nonExisting" };
    const { jd, fallback } = buildEager(spec);
    expect(fallback).toEqual([spec]);
    expect(jd.nodes).toHaveLength(0);
  });
});
