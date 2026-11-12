import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../../../lib/index.js";
import { clearReflectionsCache } from "../../../lib/reflection.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { JoinDependency } from "../../../lib/associations/join-dependency.js";
import { nodePaths } from "../../support/join-dependency-paths.js";
import { Nodes } from "@blazetrails/arel";
import type { AssociationSpec } from "../../../lib/relation/query-methods.js";

describe("JoinDependency#build", () => {
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
    }
    constSet(TopLevel, "Post", Post);
    DescendantsTracker.registerSubclass(Base, Post);
    constSet(TopLevel, "Comment", Comment);
    DescendantsTracker.registerSubclass(Base, Comment);
    constSet(TopLevel, "Author", Author);
    DescendantsTracker.registerSubclass(Base, Author);
    constSet(TopLevel, "Tag", Tag);
    DescendantsTracker.registerSubclass(Base, Tag);
    Post.hasMany("comments", { className: "Comment" });
    Comment.belongsTo("author", { className: "Author" });
    Comment.hasMany("tags", { className: "Tag" });
  });

  const paths = (jd: JoinDependency) => nodePaths(jd).sort();

  const buildEager = (spec: AssociationSpec | AssociationSpec[]) =>
    new JoinDependency(Post, Post.arelTable, spec, Nodes.OuterJoin);

  it("joins a nested hash spec instead of falling back to preload", () => {
    expect(paths(buildEager({ comments: "author" }))).toEqual(["comments", "comments.author"]);
  });

  it("deduplicates shared prefixes across hash array values", () => {
    expect(paths(buildEager({ comments: ["author", "tags"] }))).toEqual([
      "comments",
      "comments.author",
      "comments.tags",
    ]);
  });

  it("deduplicates shared prefixes across separate spec calls", () => {
    expect(paths(buildEager([{ comments: "author" }, { comments: "tags" }]))).toEqual([
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
