// Per-macro instance loaders — `record.loadBelongsTo(name)` and
// `record.loadHasOne(name)`.
//
// Two methods on Base.prototype that delegate to the standalone
// `loadBelongsTo` / `loadHasOne` helpers. Method name matches the
// association macro the user wrote, giving compile-time enforcement
// via virtualizer-emitted overloads.
//
// For collections (`hasMany` / `hasAndBelongsToMany`), the
// AssociationProxy's thenable handles the load — `await record.<name>`.

import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, AssociationNotFoundError } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("Base#loadBelongsTo / Base#loadHasOne", () => {
  let adapter: DatabaseAdapter;

  class LoAuthor extends Base {
    declare name: string;
    static {
      this.attribute("name", "string");
    }
  }

  class LoPost extends Base {
    declare title: string;
    declare loAuthorId: number | null;
    static {
      this.attribute("title", "string");
      this.attribute("lo_author_id", "integer");
    }
  }

  class LoProfile extends Base {
    declare bio: string;
    declare loAuthorId: number | null;
    static {
      this.attribute("bio", "string");
      this.attribute("lo_author_id", "integer");
    }
  }

  LoAuthor.hasMany("loPosts", { className: "LoPost" });
  LoAuthor.hasOne("loProfile", { className: "LoProfile" });
  LoPost.belongsTo("loAuthor", { className: "LoAuthor" });

  beforeEach(() => {
    adapter = createTestAdapter();
    LoAuthor.adapter = adapter;
    LoPost.adapter = adapter;
    LoProfile.adapter = adapter;
    registerModel(LoAuthor);
    registerModel(LoPost);
    registerModel(LoProfile);
  });

  it("loadBelongsTo returns the associated record", async () => {
    const author = new LoAuthor({ name: "dean" });
    await author.save();
    const post = new LoPost({ title: "hi", lo_author_id: author.id as number });
    await post.save();
    const loaded = await post.loadBelongsTo("loAuthor");
    expect((loaded as LoAuthor | null)?.name).toBe("dean");
  });

  it("loadHasOne returns the associated record", async () => {
    const author = new LoAuthor({ name: "dean" });
    await author.save();
    const profile = new LoProfile({ bio: "hey", lo_author_id: author.id as number });
    await profile.save();
    const loaded = await author.loadHasOne("loProfile");
    expect((loaded as LoProfile | null)?.bio).toBe("hey");
  });

  it("loadBelongsTo on a hasOne throws with a pointer to loadHasOne", async () => {
    const author = new LoAuthor({ name: "dean" });
    await expect(author.loadBelongsTo("loProfile")).rejects.toThrow(
      /is a hasOne, not belongsTo.*loadHasOne/,
    );
  });

  it("loadHasOne on a belongsTo throws with a pointer to loadBelongsTo", async () => {
    const post = new LoPost({ title: "hi" });
    await expect(post.loadHasOne("loAuthor")).rejects.toThrow(
      /is a belongsTo, not hasOne.*loadBelongsTo/,
    );
  });

  it("loadBelongsTo on a hasMany throws with a pointer to await", async () => {
    const author = new LoAuthor({ name: "dean" });
    await author.save();
    await expect(author.loadBelongsTo("loPosts")).rejects.toThrow(/await record\.loPosts/);
  });

  it("unknown association name throws AssociationNotFoundError", async () => {
    const author = new LoAuthor({ name: "dean" });
    await expect(author.loadBelongsTo("nope")).rejects.toBeInstanceOf(AssociationNotFoundError);
    await expect(author.loadHasOne("nope")).rejects.toBeInstanceOf(AssociationNotFoundError);
  });
});
