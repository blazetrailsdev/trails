/**
 * ThroughReflection sourceType validation (task #18).
 *
 * Rails' `ThroughReflection#check_validity!` raises at first use
 * (`Association#initialize`) for two misconfigurations:
 *   - polymorphic source without `source_type` →
 *     `HasManyThroughAssociationPolymorphicSourceError`
 *   - `source_type` with a non-polymorphic source →
 *     `HasManyThroughAssociationPointlessSourceTypeError`
 *
 * Without this check the misconfiguration silently produces
 * invalid SQL downstream (reflection.ts injects a
 * `PolymorphicReflection` whose `foreignType` resolves to `null`,
 * so `_sourceTypeScope()` emits `where({[null]: sourceType})`; the
 * unguarded polymorphic-source case has no type filter and mixes
 * ids across polymorphic target tables).
 *
 * The suite covers: both error paths via `association()` (which
 * runs the check during `Association#constructor`), the loader
 * entry point (`loadHasMany`) so direct callers that bypass the
 * proxy still surface the misconfiguration, and the valid shape
 * (polymorphic source paired with `sourceType`) to pin the
 * no-false-positive contract.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations, association, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("ThroughReflection — sourceType validation", () => {
  let adapter: DatabaseAdapter;

  class StvAuthor extends Base {
    static {
      this._tableName = "stv_authors";
      this.attribute("name", "string");
    }
  }
  class StvComment extends Base {
    static {
      this._tableName = "stv_comments";
      this.attribute("stv_author_id", "integer");
      this.attribute("origin_id", "integer");
      this.attribute("origin_type", "string");
    }
  }
  class StvPost extends Base {
    static {
      this._tableName = "stv_posts";
      this.attribute("stv_author_id", "integer");
    }
  }
  class StvMember extends Base {
    static {
      this._tableName = "stv_members";
      this.attribute("name", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    StvAuthor.adapter = adapter;
    StvComment.adapter = adapter;
    StvPost.adapter = adapter;
    StvMember.adapter = adapter;
    registerModel("StvAuthor", StvAuthor);
    registerModel("StvComment", StvComment);
    registerModel("StvPost", StvPost);
    registerModel("StvMember", StvMember);
    (StvAuthor as any)._associations = [];
    (StvAuthor as any)._reflections = {};
    (StvComment as any)._associations = [];
    (StvComment as any)._reflections = {};
    (StvPost as any)._associations = [];
    (StvPost as any)._reflections = {};
  });

  it("raises PolymorphicSourceError when source is polymorphic but sourceType is missing", async () => {
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    // Missing sourceType — the chain walker has no type filter to
    // disambiguate the polymorphic target.
    Associations.hasMany.call(StvAuthor, "originFromComments", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    const author = await StvAuthor.create({ name: "a" });
    expect(() => association(author, "originFromComments")).toThrow(
      /polymorphic association 'origin'/,
    );
  });

  it("raises PointlessSourceTypeError when sourceType is set but source is not polymorphic", async () => {
    // Non-polymorphic belongsTo source + sourceType is meaningless
    // (and would inject a PolymorphicReflection whose foreignType
    // resolves to null downstream).
    Associations.hasMany.call(StvAuthor, "stvPosts", {
      className: "StvPost",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvPost, "author", {
      className: "StvAuthor",
      foreignKey: "stv_author_id",
    });
    Associations.hasMany.call(StvAuthor, "authorsByPost", {
      className: "StvAuthor",
      through: "stvPosts",
      source: "author",
      sourceType: "StvAuthor",
    });
    const author = await StvAuthor.create({ name: "a" });
    expect(() => association(author, "authorsByPost")).toThrow(/:source_type/);
  });

  it("fires at the loadHasMany entry point too (not just association() / Association#ctor)", async () => {
    // loadHasMany is the loader path direct callers (preloader,
    // tests) hit without going through `association()`. The
    // validation has to surface there too — matching Rails'
    // Association#initialize check_validity! which runs on every
    // first use regardless of entry point.
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    Associations.hasMany.call(StvAuthor, "originFromComments", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    const author = await StvAuthor.create({ name: "a" });
    await expect(
      loadHasMany(author, "originFromComments", {
        className: "StvMember",
        through: "stvComments",
        source: "origin",
      }),
    ).rejects.toThrow(/polymorphic association 'origin'/);
  });

  it("accepts the valid shape: polymorphic source with sourceType", async () => {
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    Associations.hasMany.call(StvAuthor, "stvMembersViaComments", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
      sourceType: "StvMember",
    });
    const author = await StvAuthor.create({ name: "a" });
    expect(() => association(author, "stvMembersViaComments")).not.toThrow();
  });
});
