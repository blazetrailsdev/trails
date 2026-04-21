/**
 * ThroughReflection#checkValidityBang at first use (tasks #18 + #23).
 *
 * Rails' `Association#initialize` runs `reflection.check_validity!`
 * (reflection.rb:1140-1178) so every misconfiguration surfaces
 * loudly the first time the association is touched. We mirror that
 * via `validateThroughReflection`, called from
 * `Association#constructor`, `association(record, name)`, and the
 * loader entry points (`loadHasMany` / `loadHasOne`).
 *
 * Coverage in this suite:
 *   - polymorphic source without `source_type`
 *     → `HasManyThroughAssociationPolymorphicSourceError`
 *   - `source_type` with a non-polymorphic source
 *     → `HasManyThroughAssociationPointlessSourceTypeError`
 *   - missing source association
 *     → `HasManyThroughSourceAssociationNotFoundError`
 *   - `has_one :through` collection
 *     → `HasOneThroughCantAssociateThroughCollection`
 *   - the loader entry point so direct callers surface the same
 *     errors as the proxy
 *   - the cached-error re-throw contract (a caught failure on call
 *     N still raises on call N+1 — no silent bypass)
 *   - the valid-shape happy path (polymorphic + sourceType)
 *
 * Without this check the misconfigurations silently produce invalid
 * SQL downstream (e.g. polymorphic-source-without-source_type:
 * reflection.ts injects a `PolymorphicReflection` whose `foreignType`
 * resolves to null, the chain walker has no type filter, ids mix
 * across polymorphic targets).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations, association, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("ThroughReflection — checkValidityBang at first use", () => {
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

  it("raises HasManyThroughSourceAssociationNotFoundError for an unresolvable source", async () => {
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    // No `origin` / `origins` association on StvComment — the
    // full checkValidityBang surfaces this at first use rather
    // than silently failing deep in the chain walk.
    Associations.hasMany.call(StvAuthor, "missingSource", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    const author = await StvAuthor.create({ name: "a" });
    expect(() => association(author, "missingSource")).toThrow(
      /Could not find the source association/,
    );
  });

  it("re-throws a cached validation error on subsequent calls (caught-then-retried can't sneak past)", async () => {
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
    // First call: error surfaces.
    expect(() => association(author, "originFromComments")).toThrow(
      /polymorphic association 'origin'/,
    );
    // Second call (caller may swallow the first): same error must
    // re-throw. Cached on the reflection, never silently passed.
    expect(() => association(author, "originFromComments")).toThrow(
      /polymorphic association 'origin'/,
    );
  });

  it("raises HasOneThroughCantAssociateThroughCollection for has_one :through collection", async () => {
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
    });
    // has_one :through a has_many is Rails-invalid — the through
    // association must be singular.
    Associations.hasOne.call(StvAuthor, "singularThroughCollection", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    const author = await StvAuthor.create({ name: "a" });
    expect(() => association(author, "singularThroughCollection")).toThrow(
      /has_one :through association.*going through.*which is a collection/,
    );
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
