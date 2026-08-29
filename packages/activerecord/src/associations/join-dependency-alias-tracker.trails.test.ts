import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { JoinDependency } from "./join-dependency.js";
import { Nodes } from "@blazetrails/arel";
import { AliasCounts, AliasTracker } from "./alias-tracker.js";

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
      registerModel(m);
    }
    Associations.hasMany.call(Post, "comments", { className: "Comment", foreignKey: "postId" });
    Associations.hasMany.call(Post, "tags", { className: "Tag", foreignKey: "postId" });
  });

  it("uses an AliasTracker instance for collision tracking", () => {
    const jd = new JoinDependency(Post, null, "comments", Nodes.OuterJoin);
    jd.joinConstraints([]);
    const tracker = (jd as any)._aliasTracker as AliasTracker;
    expect(tracker).toBeInstanceOf(AliasTracker);
    expect(tracker.aliases.get("posts") ?? 0).toBeGreaterThan(0);
    expect(tracker.aliases.get("comments") ?? 0).toBeGreaterThan(0);
  });

  it("registers the base table in the tracker on construction", () => {
    const jd = new JoinDependency(Post, null, null, Nodes.OuterJoin);
    const tracker = (jd as any)._aliasTracker as AliasTracker;
    expect(tracker.aliases.get("posts")).toBe(1);
  });

  it("adopts an external AliasTracker passed to joinConstraints", () => {
    const jd = new JoinDependency(Post, null, "comments", Nodes.OuterJoin);
    const aliases = new AliasCounts(() => 0);
    aliases.set("posts", 1);
    aliases.set("comments", 1);
    const externalTracker = new AliasTracker(undefined, aliases);
    jd.joinConstraints([], externalTracker);
    expect((jd as any)._aliasTracker).toBe(externalTracker);
  });

  it("tracks multiple associations — each table counted once", () => {
    const jd = new JoinDependency(Post, null, ["comments", "tags"], Nodes.OuterJoin);
    jd.joinConstraints([]);
    const tracker = (jd as any)._aliasTracker as AliasTracker;
    expect(tracker.aliases.get("comments") ?? 0).toBeGreaterThan(0);
    expect(tracker.aliases.get("tags") ?? 0).toBeGreaterThan(0);
  });
});
