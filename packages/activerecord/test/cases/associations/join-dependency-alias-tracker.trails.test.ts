import { DescendantsTracker } from "@blazetrails/activesupport";
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../../../lib/index.js";
import { Associations } from "../../../lib/associations.js";
import { fixtures } from "../../support/use-fixtures.js";
import { JoinDependency } from "../../../lib/associations/join-dependency.js";
import { aliasTrackerFor } from "../../support/join-dependency-paths.js";
import { Nodes } from "@blazetrails/arel";
import { Hash, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { AliasTracker } from "../../../lib/associations/alias-tracker.js";

describe("JoinDependency AliasTracker wiring", () => {
  fixtures({});

  class Post extends Base {
    static {
      this.attribute("title", "string");
    }
  }
  class Comment extends Base {
    static {
      this.attribute("postId", "integer");
    }
  }
  class Tag extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  beforeEach(() => {
    for (const m of [Post, Comment, Tag]) {
      (m as any)._reflections = {};
    }
    constSet(TopLevel, "Post", Post);
    DescendantsTracker.registerSubclass(Base, Post);
    constSet(TopLevel, "Comment", Comment);
    DescendantsTracker.registerSubclass(Base, Comment);
    constSet(TopLevel, "Tag", Tag);
    DescendantsTracker.registerSubclass(Base, Tag);
    Associations.hasMany.call(Post, "comments", { className: "Comment", foreignKey: "postId" });
    Associations.hasMany.call(Post, "tags", { className: "Tag", foreignKey: "postId" });
  });

  it("uses an AliasTracker instance for collision tracking", () => {
    const jd = new JoinDependency(Post, Post.arelTable, "comments", Nodes.OuterJoin);
    jd.joinConstraints([], aliasTrackerFor(jd), []);
    const tracker = (jd as any)._aliasTracker as AliasTracker;
    expect(tracker).toBeInstanceOf(AliasTracker);
    expect(tracker.aliases.get("posts") ?? 0).toBeGreaterThan(0);
    expect(tracker.aliases.get("comments") ?? 0).toBeGreaterThan(0);
  });

  it("adopts an external AliasTracker passed to joinConstraints", () => {
    const jd = new JoinDependency(Post, Post.arelTable, "comments", Nodes.OuterJoin);
    const aliases = new Hash<string, number>(0);
    aliases.set("posts", 1);
    aliases.set("comments", 1);
    const externalTracker = new AliasTracker(undefined, aliases);
    jd.joinConstraints([], externalTracker, []);
    expect((jd as any)._aliasTracker).toBe(externalTracker);
  });

  it("tracks multiple associations — each table counted once", () => {
    const jd = new JoinDependency(Post, Post.arelTable, ["comments", "tags"], Nodes.OuterJoin);
    jd.joinConstraints([], aliasTrackerFor(jd), []);
    const tracker = (jd as any)._aliasTracker as AliasTracker;
    expect(tracker.aliases.get("comments") ?? 0).toBeGreaterThan(0);
    expect(tracker.aliases.get("tags") ?? 0).toBeGreaterThan(0);
  });
});
