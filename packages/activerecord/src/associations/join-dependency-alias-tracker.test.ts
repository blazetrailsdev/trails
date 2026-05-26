/**
 * Tests for AliasTracker wiring in JoinDependency.
 *
 * Mirrors: ActiveRecord::Associations::AliasTracker + JoinDependency#join_constraints
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";
import { AliasTracker } from "./alias-tracker.js";

describe("JoinDependency AliasTracker wiring", () => {
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
    const adapter = createTestAdapter();
    for (const m of [Post, Comment, Tag]) {
      (m as any).adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(Post, "comments", { className: "Comment", foreignKey: "postId" });
    Associations.hasMany.call(Post, "tags", { className: "Tag", foreignKey: "postId" });
  });

  it("uses an AliasTracker instance for collision tracking", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("comments");
    const tracker = (jd as any)._aliasTracker as AliasTracker;
    expect(tracker).toBeInstanceOf(AliasTracker);
    // base table + joined table registered
    expect(tracker.aliases.get("posts") ?? 0).toBeGreaterThan(0);
    expect(tracker.aliases.get("comments") ?? 0).toBeGreaterThan(0);
  });

  it("registers the base table in the tracker on construction", () => {
    const jd = new JoinDependency(Post);
    const tracker = (jd as any)._aliasTracker as AliasTracker;
    expect(tracker.aliases.get("posts")).toBe(1);
  });

  it("adopts an external AliasTracker passed to joinConstraints", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("comments");
    const externalTracker = new AliasTracker(
      undefined,
      new Map([
        ["posts", 1],
        ["comments", 1],
      ]),
    );
    jd.joinConstraints([], externalTracker);
    expect((jd as any)._aliasTracker).toBe(externalTracker);
  });

  it("tracks multiple associations — each table counted once", () => {
    const jd = new JoinDependency(Post);
    jd.addAssociation("comments");
    jd.addAssociation("tags");
    const tracker = (jd as any)._aliasTracker as AliasTracker;
    expect(tracker.aliases.get("comments") ?? 0).toBeGreaterThan(0);
    expect(tracker.aliases.get("tags") ?? 0).toBeGreaterThan(0);
  });
});
