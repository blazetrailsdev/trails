/**
 * Covers JoinDependency#build — the recursive tree construction the constructor
 * runs, which routes nested eager_load specs (hashes, dotted strings, arrays)
 * into the JOIN tree. Verifies shared-prefix deduplication and that an
 * unresolvable segment raises, as Rails' `find_reflection` does.
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
      (m as any)._reflections = {};
      clearReflectionsCache(m);
      registerModel(m);
    }
    Post.hasMany("comments", { className: "Comment" });
    Comment.belongsTo("author", { className: "Author" });
    Comment.hasMany("tags", { className: "Tag" });
  });

  const paths = (jd: JoinDependency) => jd.nodes.map((n) => n.assocName).sort();

  /** Build the way the eager-load paths do — Rails' four-argument constructor. */
  const buildEager = (spec: AssociationSpec | AssociationSpec[]) =>
    new JoinDependency(Post, null, spec, Nodes.OuterJoin);

  it("joins a nested hash spec instead of falling back to preload", () => {
    expect(paths(buildEager({ comments: "author" }))).toEqual(["comments", "comments.author"]);
  });

  it("joins a dotted-string spec", () => {
    expect(paths(buildEager("comments.author"))).toEqual(["comments", "comments.author"]);
  });

  it("deduplicates shared prefixes across hash array values", () => {
    expect(paths(buildEager({ comments: ["author", "tags"] }))).toEqual([
      "comments",
      "comments.author",
      "comments.tags",
    ]);
  });

  it("deduplicates shared prefixes across separate spec calls", () => {
    expect(paths(buildEager(["comments.author", "comments.tags"]))).toEqual([
      "comments",
      "comments.author",
      "comments.tags",
    ]);
  });

  it("raises when a segment can't be joined", () => {
    expect(() => buildEager({ comments: "nonExisting" })).toThrow(
      /Can't join 'Comment' to association named 'nonExisting'; perhaps you misspelled it\?/,
    );
  });
});
