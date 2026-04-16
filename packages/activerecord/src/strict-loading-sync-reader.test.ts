// Phase R.3: strict loading now catches sync singular-association
// reader access too. When `record._strictLoading` is enabled (via any
// of the Rails-style toggles), `record.author` / `record.profile`
// throw `StrictLoadingViolationError` on an unloaded association
// instead of silently returning null.
//
// Preserves Rails default (off) — strict loading is opt-in.

import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, StrictLoadingViolationError } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

describe("strict loading — sync singular reader (Phase R.3)", () => {
  let adapter: DatabaseAdapter;

  class SrAuthor extends Base {
    declare name: string;
    static {
      this.attribute("name", "string");
    }
  }

  class SrPost extends Base {
    declare title: string;
    declare srAuthorId: number | null;
    static {
      this.attribute("title", "string");
      this.attribute("sr_author_id", "integer");
    }
  }

  class SrProfile extends Base {
    declare bio: string;
    declare srAuthorId: number | null;
    static {
      this.attribute("bio", "string");
      this.attribute("sr_author_id", "integer");
    }
  }

  SrAuthor.hasOne("srProfile", { className: "SrProfile" });
  SrPost.belongsTo("srAuthor", { className: "SrAuthor" });

  beforeEach(() => {
    adapter = createTestAdapter();
    SrAuthor.adapter = adapter;
    SrPost.adapter = adapter;
    SrProfile.adapter = adapter;
    registerModel(SrAuthor);
    registerModel(SrPost);
    registerModel(SrProfile);
  });

  it("sync belongsTo access throws when strict loading is enabled and not loaded", async () => {
    const author = new SrAuthor({ name: "dean" });
    await author.save();
    const post = new SrPost({ title: "hi", sr_author_id: author.id as number });
    await post.save();
    post.strictLoadingBang();
    expect(() => (post as any).srAuthor).toThrow(StrictLoadingViolationError);
  });

  it("sync hasOne access throws when strict loading is enabled and not loaded", async () => {
    const author = new SrAuthor({ name: "dean" });
    await author.save();
    author.strictLoadingBang();
    expect(() => (author as any).srProfile).toThrow(StrictLoadingViolationError);
  });

  it("sync access returns the record (no throw) once loaded", async () => {
    const author = new SrAuthor({ name: "dean" });
    await author.save();
    const post = new SrPost({ title: "hi", sr_author_id: author.id as number });
    await post.save();
    post.strictLoadingBang();
    // Explicit load populates the association cache.
    await post.loadBelongsTo("srAuthor");
    // Subsequent sync access should succeed.
    expect(() => (post as any).srAuthor).not.toThrow();
    const a = (post as any).srAuthor as SrAuthor;
    expect(a.name).toBe("dean");
  });

  it("strict loading stays off by default (Rails parity)", () => {
    // `strictLoadingByDefault` is false unless explicitly enabled.
    expect(SrPost.strictLoadingByDefault).toBe(false);
    expect(SrAuthor.strictLoadingByDefault).toBe(false);
    // And newly constructed records have strictLoading off.
    const post = new SrPost({ title: "hi" });
    expect(post.isStrictLoading()).toBe(false);
  });

  it("per-class toggle: strictLoadingByDefault = true makes all instances strict", async () => {
    class StrictPost extends Base {
      declare title: string;
      declare srAuthorId: number | null;
      static {
        this.attribute("title", "string");
        this.attribute("sr_author_id", "integer");
      }
    }
    StrictPost.belongsTo("srAuthor", { className: "SrAuthor" });
    StrictPost.adapter = adapter;
    StrictPost.strictLoadingByDefault = true;
    registerModel(StrictPost);

    try {
      const author = new SrAuthor({ name: "dean" });
      await author.save();
      const post = new StrictPost({ title: "hi", sr_author_id: author.id as number });
      await post.save();
      // Loaded via find — strictLoading is applied.
      const fetched = await StrictPost.find(post.id);
      expect(fetched.isStrictLoading()).toBe(true);
      expect(() => (fetched as any).srAuthor).toThrow(StrictLoadingViolationError);
    } finally {
      StrictPost.strictLoadingByDefault = false;
    }
  });

  it("per-instance opt-out: strictLoadingBang(false) suppresses the throw", async () => {
    const author = new SrAuthor({ name: "dean" });
    await author.save();
    const post = new SrPost({ title: "hi", sr_author_id: author.id as number });
    await post.save();
    post.strictLoadingBang();
    // Flip off via the public API — access should NOT throw.
    post.strictLoadingBang(false);
    expect(post.isStrictLoading()).toBe(false);
    expect(() => (post as any).srAuthor).not.toThrow();
  });

  it("belongsTo with null FK returns null without throwing under strict loading", async () => {
    // No FK set → no DB query is needed to determine there's no
    // associated record. `findTargetNeeded()` is false, so strict
    // loading does not fire.
    const post = new SrPost({ title: "orphan" });
    await post.save();
    post.strictLoadingBang();
    expect(() => (post as any).srAuthor).not.toThrow();
    expect((post as any).srAuthor).toBeNull();
  });

  it("preloaded singular mapped to null does not throw (eagerly-loaded nil)", async () => {
    const post = new SrPost({ title: "hi" });
    await post.save();
    post.strictLoadingBang();
    // Simulate an eager load that resolved to null (e.g., `Post.includes("srAuthor").find(id)`
    // where the author record doesn't exist). The preloaded-null is a
    // legitimate answer — no query needed, no throw.
    (post as any)._preloadedAssociations = new Map([["srAuthor", null]]);
    expect(() => (post as any).srAuthor).not.toThrow();
    expect((post as any).srAuthor).toBeNull();
  });

  it("cached association via inverse_of does not throw under strict loading", async () => {
    const post = new SrPost({ title: "hi" });
    await post.save();
    post.strictLoadingBang();
    const author = new SrAuthor({ name: "dean" });
    // Populate the direct cache (the path inverse_of uses).
    (post as any)._cachedAssociations = new Map([["srAuthor", author]]);
    expect(() => (post as any).srAuthor).not.toThrow();
    expect(((post as any).srAuthor as SrAuthor).name).toBe("dean");
  });

  it("hasOne on a new (unsaved) owner returns null without throwing", async () => {
    // New records with no primary key → `findTargetNeeded()` is false
    // (no ID to query by), so strict loading does not fire.
    const author = new SrAuthor({ name: "dean" });
    author.strictLoadingBang();
    expect(() => (author as any).srProfile).not.toThrow();
    expect((author as any).srProfile).toBeNull();
  });

  it("in-memory `target` set directly (e.g. Preloader path) returns without throwing", async () => {
    // Some internal paths (e.g., Preloader::Association) bind
    // `association.target = record` without calling `loadedBang()`.
    // The reader should treat a non-null target as already resolved —
    // no DB load would run, so strict loading should not fire.
    const post = new SrPost({ title: "hi" });
    await post.save();
    post.strictLoadingBang();
    const author = new SrAuthor({ name: "dean" });
    const assoc = post.association("srAuthor") as any;
    assoc.target = author;
    // loaded is still false; reader should short-circuit on the
    // non-null target.
    expect(assoc.loaded).toBe(false);
    expect(() => (post as any).srAuthor).not.toThrow();
    expect(((post as any).srAuthor as SrAuthor).name).toBe("dean");
    // Reader should have marked it loaded as a side effect.
    expect(assoc.loaded).toBe(true);
  });
});
