import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import { Associations } from "../associations.js";
import { AssociationScope, ReflectionProxy } from "./association-scope.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("AssociationScope", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  function makeModels() {
    class AsAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class AsPost extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("as_author_id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(AsAuthor);
    registerModel(AsPost);
    Associations.hasMany.call(AsAuthor, "as_posts", {
      className: "AsPost",
      foreignKey: "as_author_id",
    });
    Associations.belongsTo.call(AsPost, "as_author", {
      className: "AsAuthor",
      foreignKey: "as_author_id",
    });
    return { AsAuthor, AsPost };
  }

  it("INSTANCE is a shared identity-transformation instance", () => {
    expect(AssociationScope.INSTANCE).toBeInstanceOf(AssociationScope);
    // static scope() delegates to INSTANCE.scope()
    expect(typeof AssociationScope.scope).toBe("function");
  });

  it("create(valueTransformation) accepts a custom transformer", () => {
    const upcased = AssociationScope.create((v: unknown) =>
      typeof v === "string" ? v.toUpperCase() : v,
    );
    expect(upcased).toBeInstanceOf(AssociationScope);
    // Instance-level scope is exposed; static reuses INSTANCE.
    expect(typeof upcased.scope).toBe("function");
  });

  it("builds a hasMany scope with WHERE on the target's FK = owner.PK", async () => {
    const { AsAuthor } = makeModels();
    const author = new AsAuthor({ id: 7, name: "Alice" });
    const reflection = (AsAuthor as any)._reflectOnAssociation("as_posts");
    expect(reflection).toBeDefined();

    const scope: any = AssociationScope.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    });

    const sql = scope.toSql();
    expect(sql).toMatch(/"as_posts".*"as_author_id"\s*=\s*7/s);
  });

  it("builds a belongsTo scope with WHERE on the target's PK = owner.FK + limit(1)", async () => {
    const { AsAuthor, AsPost } = makeModels();
    const post = new AsPost({ id: 1, as_author_id: 42, title: "x" });
    const reflection = (AsPost as any)._reflectOnAssociation("as_author");
    expect(reflection).toBeDefined();
    expect(reflection.klass).toBe(AsAuthor);

    const scope: any = AssociationScope.scope({
      owner: post,
      reflection,
      klass: reflection.klass,
    });

    const sql = scope.toSql();
    // belongsTo → WHERE target.id = owner.fk; isCollection? false → LIMIT 1.
    expect(sql).toMatch(/"as_authors".*"id"\s*=\s*42.*LIMIT\s+1/s);
  });

  it("getBindValues collects owner's join_foreign_key values (chain length 1)", () => {
    const { AsAuthor } = makeModels();
    const author = new AsAuthor({ id: 99, name: "Bob" });
    const reflection = (AsAuthor as any)._reflectOnAssociation("as_posts");

    const binds = AssociationScope.getBindValues(author, [reflection]);
    // hasMany: joinForeignKey = owner PK ("id"). Owner id = 99.
    expect(binds).toEqual([99]);
  });

  it("ReflectionProxy delegates joinPrimaryKey / joinForeignKey / klass to the reflection", () => {
    const { AsAuthor, AsPost } = makeModels();
    const reflection = (AsAuthor as any)._reflectOnAssociation("as_posts");
    const proxy = new ReflectionProxy(reflection, /* aliasedTable */ null);

    expect(proxy.joinPrimaryKey).toBe(reflection.joinPrimaryKey);
    expect(proxy.joinForeignKey).toBe(reflection.joinForeignKey);
    expect(proxy.klass).toBe(AsPost);
    // Rails' all_includes; block returns nil → we return null.
    expect(proxy.allIncludes()).toBeNull();
  });

  it("applies reflection.scope lambda exactly once (no double-apply)", () => {
    class CountAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    let calls = 0;
    class CountPost extends Base {
      static {
        this.attribute("count_author_id", "integer");
        this.attribute("published", "boolean");
        this.adapter = adapter;
      }
    }
    registerModel(CountAuthor);
    registerModel(CountPost);
    Associations.hasMany.call(CountAuthor, "count_posts", {
      className: "CountPost",
      foreignKey: "count_author_id",
      scope: (rel: any) => {
        calls++;
        return rel.where({ published: true });
      },
    });

    const author = new CountAuthor({ id: 5 });
    const reflection = (CountAuthor as any)._reflectOnAssociation("count_posts");
    const scope: any = AssociationScope.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    });

    // The lambda must run exactly once — _addConstraints applies it via
    // reflection.scope; the loader path must not re-apply options.scope.
    expect(calls).toBe(1);
    expect(scope.toSql()).toMatch(/"published"\s*=\s*TRUE/i);
  });

  it("applies STI type_condition on subclass targets (compensates for our unscoped)", () => {
    // Rails' klass.unscoped applies STI type_condition via core.rb's
    // relation() override; ours doesn't, so AssociationScope re-adds it.
    class StiOwner extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class StiBase extends Base {
      static {
        this.attribute("type", "string");
        this.attribute("sti_owner_id", "integer");
        this._tableName = "sti_things";
        this.adapter = adapter;
        enableSti(StiBase);
      }
    }
    class StiSpecial extends StiBase {
      static {
        this.adapter = adapter;
        registerModel(StiSpecial);
        registerSubclass(StiSpecial);
      }
    }
    registerModel(StiOwner);
    registerModel(StiBase);
    Associations.hasMany.call(StiOwner, "sti_specials", {
      className: "StiSpecial",
      foreignKey: "sti_owner_id",
    });

    const owner = new StiOwner({ id: 3 });
    const reflection = (StiOwner as any)._reflectOnAssociation("sti_specials");
    const scope: any = AssociationScope.scope({
      owner,
      reflection,
      klass: reflection.klass,
    });

    expect(scope.toSql()).toMatch(/"type"\s*=\s*'StiSpecial'/);
  });

  it("loadHasMany merges target's scope_for_association (default_scope flows through)", async () => {
    // Rails' Association#scope is
    //   AssociationRelation.create(klass, self).merge!(klass.scope_for_association)
    // (associations/association.rb:313). The reflection-backed loader
    // path must merge in the target's default_scope so behavior matches
    // the inline path (targetModel.all().where(...)).
    class DsAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class DsPost extends Base {
      static {
        this.attribute("ds_author_id", "integer");
        this.attribute("published", "boolean");
        this.adapter = adapter;
        this.defaultScope((rel: any) => rel.where({ published: true }));
      }
    }
    registerModel(DsAuthor);
    registerModel(DsPost);
    Associations.hasMany.call(DsAuthor, "ds_posts", {
      className: "DsPost",
      foreignKey: "ds_author_id",
    });

    const author = new DsAuthor({ id: 1 });
    const reflection = (DsAuthor as any)._reflectOnAssociation("ds_posts");
    // Replicate the loader's merge so the test pins the actual Rails
    // shape rather than just the unscoped+constraints intermediate.
    const built = AssociationScope.scope({
      owner: author,
      reflection,
      klass: DsPost,
    }) as any;
    const merged = (DsPost as any).scopeForAssociation().merge(built);
    const sql = merged.toSql();
    expect(sql).toMatch(/"published"\s*=\s*TRUE/i);
    expect(sql).toMatch(/"ds_author_id"\s*=\s*1/);
  });

  it("loadHasMany applies caller-supplied options.scope when it differs from reflection.scope", async () => {
    // Regression for the loadHasManyThrough path that wraps options.scope
    // with sourceType filtering before calling loadHasMany. The migrated
    // path skips re-applying when options.scope === reflection.scope
    // (avoid double-application), but augmented scopes must still run.
    const { loadHasMany } = await import("../associations.js");
    class WrAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class WrPost extends Base {
      static {
        this.attribute("wr_author_id", "integer");
        this.attribute("kind", "string");
        this.adapter = adapter;
      }
    }
    registerModel(WrAuthor);
    registerModel(WrPost);
    Associations.hasMany.call(WrAuthor, "wr_posts", {
      className: "WrPost",
      foreignKey: "wr_author_id",
    });

    const author = await WrAuthor.create({});
    await WrPost.create({ wr_author_id: author.id, kind: "draft" });
    await WrPost.create({ wr_author_id: author.id, kind: "published" });

    // Augmented options.scope — NOT equal to the reflection's macro
    // scope (which is null here). Loader must still apply it.
    const results = await loadHasMany(author, "wr_posts", {
      className: "WrPost",
      foreignKey: "wr_author_id",
      scope: (rel: any) => rel.where({ kind: "published" }),
    });
    expect(results).toHaveLength(1);
    expect((results[0] as any).kind).toBe("published");
  });

  it("invokes 0-arity scope lambda with this=relation (Rails instance_exec semantics)", () => {
    // Rails: `relation.instance_exec(owner, &scope) || relation`. A
    // 0-arity scope (e.g. `-> { where(active: true) }`) reads `self`
    // as the relation, so we must bind `this` rather than passing the
    // relation as the first arg.
    class ZeroArityAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class ZeroArityPost extends Base {
      static {
        this.attribute("zero_arity_author_id", "integer");
        this.attribute("active", "boolean");
        this.adapter = adapter;
      }
    }
    registerModel(ZeroArityAuthor);
    registerModel(ZeroArityPost);
    Associations.hasMany.call(ZeroArityAuthor, "zero_arity_posts", {
      className: "ZeroArityPost",
      foreignKey: "zero_arity_author_id",
      // The function's .length is 0, so the loader must use scopeFor's
      // 0-arity branch (this=relation). If we passed it as a 1-arg
      // function, `where` would not exist on the empty arg.
      scope: function (this: any) {
        return this.where({ active: true });
      },
    });

    const owner = new ZeroArityAuthor({ id: 1 });
    const reflection = (ZeroArityAuthor as any)._reflectOnAssociation("zero_arity_posts");
    const sql = (
      AssociationScope.scope({ owner, reflection, klass: reflection.klass }) as any
    ).toSql();
    expect(sql).toMatch(/"active"\s*=\s*TRUE/i);
  });

  it("hasMany :as adds the polymorphic type WHERE on the target table", () => {
    // For `hasMany :comments, as: :commentable`, Rails' AssociationScope
    // builds `WHERE comments.commentable_id = owner.id AND
    // comments.commentable_type = OwnerClass.name`. The type filter
    // comes from reflection.type === foreignType (`commentable_type`).
    class AsOwner extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class AsComment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(AsOwner);
    registerModel(AsComment);
    Associations.hasMany.call(AsOwner, "as_comments", {
      className: "AsComment",
      as: "commentable",
    });
    const owner = new AsOwner({ id: 7 });
    const reflection = (AsOwner as any)._reflectOnAssociation("as_comments");
    const sql = (
      AssociationScope.scope({ owner, reflection, klass: reflection.klass }) as any
    ).toSql();
    expect(sql).toMatch(/"commentable_id"\s*=\s*7/);
    expect(sql).toMatch(/"commentable_type"\s*=\s*'AsOwner'/);
  });

  it("hasOne :as adds the polymorphic type WHERE plus LIMIT 1", () => {
    class AsOneOwner extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class AsOneImage extends Base {
      static {
        this.attribute("imageable_id", "integer");
        this.attribute("imageable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(AsOneOwner);
    registerModel(AsOneImage);
    Associations.hasOne.call(AsOneOwner, "as_one_image", {
      className: "AsOneImage",
      as: "imageable",
    });
    const owner = new AsOneOwner({ id: 3 });
    const reflection = (AsOneOwner as any)._reflectOnAssociation("as_one_image");
    const sql = (
      AssociationScope.scope({ owner, reflection, klass: reflection.klass }) as any
    ).toSql();
    expect(sql).toMatch(/"imageable_id"\s*=\s*3/);
    expect(sql).toMatch(/"imageable_type"\s*=\s*'AsOneOwner'/);
    expect(sql).toMatch(/LIMIT\s+1/);
  });

  it("polymorphic belongsTo accepts a runtime-resolved klass via AssociationScopeable", () => {
    // Polymorphic belongsTo: target klass is resolved at runtime from
    // owner's <assoc>_type column. Callers (loadBelongsTo) pass the
    // resolved klass via the AssociationScopeable.klass field; the
    // reflection's joinPrimaryKey returns the target's PK and
    // joinForeignKey returns the owner-side FK column.
    class PolyTarget extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class PolyComment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(PolyTarget);
    registerModel(PolyComment);
    Associations.belongsTo.call(PolyComment, "commentable", { polymorphic: true });
    const comment = new PolyComment({ commentable_id: 99, commentable_type: "PolyTarget" });
    const reflection = (PolyComment as any)._reflectOnAssociation("commentable");
    const sql = (
      AssociationScope.scope({ owner: comment, reflection, klass: PolyTarget }) as any
    ).toSql();
    // Target side: WHERE poly_targets.id = 99 (the FK value), LIMIT 1.
    expect(sql).toMatch(/"poly_targets"/);
    expect(sql).toMatch(/"id"\s*=\s*99/);
    expect(sql).toMatch(/LIMIT\s+1/);
  });

  it("loadHasMany rejects composite primary key with :as polymorphic", async () => {
    // Rails doesn't support polymorphic :as combined with composite
    // owner PK / composite FK — the polymorphic FK column is a single
    // <as>_id by convention. Loaders must throw fast rather than
    // silently building a broken WHERE via readAttribute(undefined).
    const { loadHasMany, CompositePrimaryKeyMismatchError } = await import("../index.js");
    class CpkAsOwner extends Base {
      static {
        this.attribute("a", "integer");
        this.attribute("b", "integer");
        this.primaryKey = ["a", "b"];
        this.adapter = adapter;
      }
    }
    class CpkAsTarget extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(CpkAsOwner);
    registerModel(CpkAsTarget);
    const owner = new CpkAsOwner({ a: 1, b: 2 });
    await expect(
      loadHasMany(owner, "comments", {
        className: "CpkAsTarget",
        as: "commentable",
      }),
    ).rejects.toThrow(CompositePrimaryKeyMismatchError);
  });

  it("polymorphic belongsTo uses runtime klass's primary key (non-id PK)", () => {
    // BelongsToReflection#joinPrimaryKey hard-codes "id" for polymorphic
    // associations because the target klass isn't known at definition
    // time. AssociationScope must route through joinPrimaryKeyFor(klass)
    // so a target with a non-default PK (e.g. "uuid") gets the right
    // WHERE column. Regression for Copilot review on PR #618.
    class UuidTarget extends Base {
      static {
        this.attribute("uuid", "string");
        this.primaryKey = "uuid";
        this.adapter = adapter;
      }
    }
    class UuidComment extends Base {
      static {
        this.attribute("commentable_id", "string");
        this.attribute("commentable_type", "string");
        this.adapter = adapter;
      }
    }
    registerModel(UuidTarget);
    registerModel(UuidComment);
    Associations.belongsTo.call(UuidComment, "commentable", { polymorphic: true });
    const comment = new UuidComment({
      commentable_id: "abc-123",
      commentable_type: "UuidTarget",
    });
    const reflection = (UuidComment as any)._reflectOnAssociation("commentable");
    const sql = (
      AssociationScope.scope({ owner: comment, reflection, klass: UuidTarget }) as any
    ).toSql();
    // Must WHERE on uuid (the target's actual PK), NOT id.
    expect(sql).toMatch(/"uuid"\s*=\s*'abc-123'/);
    expect(sql).not.toMatch(/"id"\s*=/);
  });

  it("static scope() routes through this.INSTANCE (subclass dispatch)", async () => {
    const { DisableJoinsAssociationScope } = await import("./disable-joins-association-scope.js");
    expect(DisableJoinsAssociationScope.INSTANCE).toBeInstanceOf(DisableJoinsAssociationScope);
    // Subclass INSTANCE shadows the parent's so polymorphic
    // this.INSTANCE in `static scope` resolves to the subclass instance.
    expect(DisableJoinsAssociationScope.INSTANCE).not.toBe(AssociationScope.INSTANCE);
  });

  it("through chain merges scope on the through reflection (chain.reverse_each)", () => {
    // Rails' add_constraints walks chain.reverse_each over each
    // reflection's constraints and merges WHERE/ORDER predicates from
    // the scope lambda into the main relation. PR 3b adds this for
    // non-head chain entries: a scope on the through reflection (e.g.
    // `hasMany :memberships, scope: r => r.where(active: true)`) must
    // emit `WHERE memberships.active = TRUE` on the JOINed-in table.
    class CcAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class CcMembership extends Base {
      static {
        this.attribute("cc_author_id", "integer");
        this.attribute("cc_tag_id", "integer");
        this.attribute("active", "boolean");
        this.adapter = adapter;
      }
    }
    class CcTag extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(CcAuthor);
    registerModel(CcMembership);
    registerModel(CcTag);
    Associations.hasMany.call(CcAuthor, "cc_memberships", {
      className: "CcMembership",
      foreignKey: "cc_author_id",
      // Scope on the through reflection — chain.reverse_each must pick
      // it up when AssociationScope walks the chain for cc_tags.
      scope: (rel: any) => rel.where({ active: true }),
    });
    Associations.hasMany.call(CcAuthor, "cc_tags", {
      className: "CcTag",
      through: "cc_memberships",
      source: "cc_tag",
    });
    Associations.belongsTo.call(CcMembership, "cc_tag", {
      className: "CcTag",
      foreignKey: "cc_tag_id",
    });

    const author = new CcAuthor({ id: 1 });
    const reflection = (CcAuthor as any)._reflectOnAssociation("cc_tags");
    const sql = (
      AssociationScope.scope({
        owner: author,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toSql();
    expect(sql).toMatch(/INNER JOIN\s+"?cc_memberships"?/i);
    expect(sql).toMatch(/"cc_memberships"\."cc_author_id"\s*=\s*1/);
    expect(sql).toMatch(/"cc_memberships"\."active"\s*=\s*TRUE/i);
  });

  it("loadHasMany through with sourceType filters by polymorphic source type (PR 3c)", async () => {
    // Gallery belongsTo :imageable, polymorphic: true (the Gallery
    // model holds the polymorphic FK + type pair). When we hop through
    // galleries with a sourceType filter, PolymorphicReflection wraps
    // the chain entry and adds a type constraint
    // `where(imageable_type: sourceType)`. PR 3c's
    // _mergeReflectionScopeChain detects PolymorphicReflection and
    // applies its constraints() — including the source_type_scope —
    // to the chain JOIN so only the right polymorphic rows match.
    const { loadHasMany } = await import("../associations.js");
    class StAuthor extends Base {
      declare name: string;
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class StGallery extends Base {
      static {
        this.attribute("st_author_id", "integer");
        this.attribute("imageable_id", "integer");
        this.attribute("imageable_type", "string");
        this.adapter = adapter;
      }
    }
    class StPhoto extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    class StVideo extends Base {
      declare title: string;
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    registerModel(StAuthor);
    registerModel(StGallery);
    registerModel(StPhoto);
    registerModel(StVideo);
    Associations.hasMany.call(StAuthor, "st_galleries", {
      className: "StGallery",
      foreignKey: "st_author_id",
    });
    Associations.belongsTo.call(StGallery, "imageable", { polymorphic: true });
    // Through with sourceType — only StPhoto galleries should match.
    Associations.hasMany.call(StAuthor, "st_photos", {
      className: "StPhoto",
      through: "st_galleries",
      source: "imageable",
      sourceType: "StPhoto",
    });

    const author = await StAuthor.create({ name: "Alice" });
    const photo = await StPhoto.create({ title: "p1" });
    const video = await StVideo.create({ title: "v1" });
    await StGallery.create({
      st_author_id: author.id,
      imageable_id: photo.id,
      imageable_type: "StPhoto",
    });
    await StGallery.create({
      st_author_id: author.id,
      imageable_id: video.id,
      imageable_type: "StVideo",
    });

    const photos = (await loadHasMany(author, "st_photos", {
      className: "StPhoto",
      through: "st_galleries",
      source: "imageable",
      sourceType: "StPhoto",
    })) as StPhoto[];
    // Without sourceType filtering, the through join would return BOTH
    // gallery rows; we'd then JOIN to the wrong rows in st_photos.
    // With the filter, only the StPhoto-typed gallery participates.
    expect(photos.map((p) => p.title)).toEqual(["p1"]);
  });

  it("loadHasMany through with sourceType + non-id target PK uses correct join column", async () => {
    // Regression: BelongsToReflection.joinPrimaryKey hard-codes "id"
    // for polymorphic sources, but the sourceType target may use a
    // different PK. Without per-klass JOIN routing, we'd emit
    // target."id" = through."<fk>" instead of target."<custom_pk>".
    const { loadHasMany } = await import("../associations.js");
    class NpAuthor extends Base {
      declare name: string;
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class NpGallery extends Base {
      static {
        this.attribute("np_author_id", "integer");
        this.attribute("imageable_uuid", "string");
        this.attribute("imageable_type", "string");
        this.adapter = adapter;
      }
    }
    class NpPhoto extends Base {
      declare title: string;
      static {
        this.attribute("uuid", "string");
        this.attribute("title", "string");
        this.primaryKey = "uuid";
        this.adapter = adapter;
      }
    }
    registerModel(NpAuthor);
    registerModel(NpGallery);
    registerModel(NpPhoto);
    Associations.hasMany.call(NpAuthor, "np_galleries", {
      className: "NpGallery",
      foreignKey: "np_author_id",
    });
    Associations.belongsTo.call(NpGallery, "imageable", {
      polymorphic: true,
      foreignKey: "imageable_uuid",
    });
    Associations.hasMany.call(NpAuthor, "np_photos", {
      className: "NpPhoto",
      through: "np_galleries",
      source: "imageable",
      sourceType: "NpPhoto",
    });

    const author = await NpAuthor.create({ name: "Alice" });
    const photo = await NpPhoto.create({ uuid: "u1", title: "p1" });
    await NpGallery.create({
      np_author_id: author.id,
      imageable_uuid: "u1",
      imageable_type: "NpPhoto",
    });

    const photos = (await loadHasMany(author, "np_photos", {
      className: "NpPhoto",
      through: "np_galleries",
      source: "imageable",
      sourceType: "NpPhoto",
    })) as NpPhoto[];
    expect(photos.map((p) => p.title)).toEqual(["p1"]);
  });

  it("loadHasOne through with hasOne source routes via AssociationScope and returns one record", async () => {
    // PR 3c also covers hasOne source on the through model. e.g.,
    // User has_one :account; Account has_one :preferences;
    // User has_one :preferences through :account (source is hasOne,
    // not belongsTo). Verifies the join direction differs from
    // belongsTo-source — target's FK back to through, not the other
    // way — and that loadHasOne returns exactly one record.
    const { loadHasOne } = await import("../associations.js");
    class Ho1User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Ho1Account extends Base {
      static {
        this.attribute("ho1_user_id", "integer");
        this.adapter = adapter;
      }
    }
    class Ho1Pref extends Base {
      declare theme: string;
      static {
        this.attribute("ho1_account_id", "integer");
        this.attribute("theme", "string");
        this.adapter = adapter;
      }
    }
    registerModel(Ho1User);
    registerModel(Ho1Account);
    registerModel(Ho1Pref);
    Associations.hasOne.call(Ho1User, "ho1_account", {
      className: "Ho1Account",
      foreignKey: "ho1_user_id",
    });
    Associations.hasOne.call(Ho1Account, "ho1_pref", {
      className: "Ho1Pref",
      foreignKey: "ho1_account_id",
    });
    Associations.hasOne.call(Ho1User, "ho1_pref", {
      className: "Ho1Pref",
      through: "ho1_account",
      source: "ho1_pref",
    });

    const user = await Ho1User.create({ name: "Alice" });
    const account = await Ho1Account.create({ ho1_user_id: user.id });
    await Ho1Pref.create({ ho1_account_id: account.id, theme: "dark" });

    const pref = (await loadHasOne(user, "ho1_pref", {
      className: "Ho1Pref",
      through: "ho1_account",
      source: "ho1_pref",
    })) as Ho1Pref | null;
    expect(pref).not.toBeNull();
    expect(pref!.theme).toBe("dark");
  });

  it("loadHasMany through with has_many source routes via AssociationScope (PR 3c widening)", async () => {
    // Author has_many :posts; Post has_many :comments; Author has_many
    // :comments, through: :posts (source: :comments → has_many on Post,
    // NOT belongsTo). PR 3b only routed belongsTo-source shapes; PR 3c
    // widens to has_many source — the chain machinery already handles
    // the join direction via reflection.joinPrimaryKey/joinForeignKey
    // delegation, the gate just needed dropping.
    const { loadHasMany } = await import("../associations.js");
    class HsAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class HsPost extends Base {
      static {
        this.attribute("hs_author_id", "integer");
        this.adapter = adapter;
      }
    }
    class HsComment extends Base {
      declare body: string;
      static {
        this.attribute("hs_post_id", "integer");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    registerModel(HsAuthor);
    registerModel(HsPost);
    registerModel(HsComment);
    Associations.hasMany.call(HsAuthor, "hs_posts", {
      className: "HsPost",
      foreignKey: "hs_author_id",
    });
    Associations.hasMany.call(HsPost, "hs_comments", {
      className: "HsComment",
      foreignKey: "hs_post_id",
    });
    Associations.hasMany.call(HsAuthor, "hs_comments", {
      className: "HsComment",
      through: "hs_posts",
      source: "hs_comments",
    });

    const author = await HsAuthor.create({ name: "Alice" });
    const p1 = await HsPost.create({ hs_author_id: author.id });
    const p2 = await HsPost.create({ hs_author_id: author.id });
    await HsComment.create({ hs_post_id: p1.id, body: "first" });
    await HsComment.create({ hs_post_id: p2.id, body: "second" });
    // Another author's comment shouldn't show up
    const other = await HsAuthor.create({ name: "Bob" });
    const op = await HsPost.create({ hs_author_id: other.id });
    await HsComment.create({ hs_post_id: op.id, body: "other" });

    const comments = (await loadHasMany(author, "hs_comments", {
      className: "HsComment",
      through: "hs_posts",
      source: "hs_comments",
    })) as HsComment[];
    expect(comments.map((c) => c.body).sort()).toEqual(["first", "second"]);
  });

  it("loadHasOne through chain (belongsTo source) routes via AssociationScope and returns one record", async () => {
    // PR 3b migration covers loadHasOne too. End-to-end: insert,
    // call loadHasOne with a through reflection, assert single result.
    const { loadHasOne } = await import("../associations.js");
    class HotPost extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class HotPostHook extends Base {
      static {
        this.attribute("hot_post_id", "integer");
        this.attribute("hot_review_id", "integer");
        this.adapter = adapter;
      }
    }
    class HotReview extends Base {
      declare body: string;
      static {
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    registerModel(HotPost);
    registerModel(HotPostHook);
    registerModel(HotReview);
    Associations.hasOne.call(HotPost, "hot_post_hook", {
      className: "HotPostHook",
      foreignKey: "hot_post_id",
    });
    Associations.hasOne.call(HotPost, "hot_review", {
      className: "HotReview",
      through: "hot_post_hook",
      source: "hot_review",
    });
    Associations.belongsTo.call(HotPostHook, "hot_review", {
      className: "HotReview",
      foreignKey: "hot_review_id",
    });

    const post = await HotPost.create({});
    const review = await HotReview.create({ body: "Great post" });
    await HotPostHook.create({ hot_post_id: post.id, hot_review_id: review.id });

    const loaded = (await loadHasOne(post, "hot_review", {
      className: "HotReview",
      through: "hot_post_hook",
      source: "hot_review",
    })) as HotReview | null;
    expect(loaded).not.toBeNull();
    expect(loaded!.body).toBe("Great post");
  });

  it("loadHasMany through chain (belongsTo source, no sourceType) routes via AssociationScope", async () => {
    // PR 3b migration: loadHasMany for has_many :through where source
    // is non-polymorphic belongsTo (no sourceType) now routes through
    // AssociationScope's JOIN-based path instead of the 2-step IN-list
    // loader. End-to-end: insert records, call loadHasMany, assert the
    // right rows return — exercises the migrated path through real DB.
    const { loadHasMany } = await import("../associations.js");
    class MgAuthor extends Base {
      declare name: string;
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class MgPosting extends Base {
      static {
        this.attribute("mg_author_id", "integer");
        this.attribute("mg_tag_id", "integer");
        this.adapter = adapter;
      }
    }
    class MgTag extends Base {
      declare label: string;
      static {
        this.attribute("label", "string");
        this.adapter = adapter;
      }
    }
    registerModel(MgAuthor);
    registerModel(MgPosting);
    registerModel(MgTag);
    Associations.hasMany.call(MgAuthor, "mg_postings", {
      className: "MgPosting",
      foreignKey: "mg_author_id",
    });
    Associations.hasMany.call(MgAuthor, "mg_tags", {
      className: "MgTag",
      through: "mg_postings",
      source: "mg_tag",
    });
    Associations.belongsTo.call(MgPosting, "mg_tag", {
      className: "MgTag",
      foreignKey: "mg_tag_id",
    });

    const alice = await MgAuthor.create({ name: "Alice" });
    const bob = await MgAuthor.create({ name: "Bob" });
    const ruby = await MgTag.create({ label: "ruby" });
    const ts = await MgTag.create({ label: "typescript" });
    const go = await MgTag.create({ label: "go" });
    await MgPosting.create({ mg_author_id: alice.id, mg_tag_id: ruby.id });
    await MgPosting.create({ mg_author_id: alice.id, mg_tag_id: ts.id });
    await MgPosting.create({ mg_author_id: bob.id, mg_tag_id: go.id });

    const tags = (await loadHasMany(alice, "mg_tags", {
      className: "MgTag",
      through: "mg_postings",
      source: "mg_tag",
    })) as MgTag[];
    expect(tags.map((t) => t.label).sort()).toEqual(["ruby", "typescript"]);
  });

  it("through chain query loads actual records end-to-end (Author -> Memberships -> Tags)", async () => {
    // Real DB roundtrip: insert records, build the through scope via
    // AssociationScope, execute it, assert the right rows come back.
    // Proves the chain-walking machinery isn't just generating valid-
    // looking SQL — it actually returns the correct records.
    class IntAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class IntMembership extends Base {
      static {
        this.attribute("int_author_id", "integer");
        this.attribute("int_tag_id", "integer");
        this.adapter = adapter;
      }
    }
    class IntTag extends Base {
      declare label: string;
      static {
        this.attribute("id", "integer");
        this.attribute("label", "string");
        this.adapter = adapter;
      }
    }
    registerModel(IntAuthor);
    registerModel(IntMembership);
    registerModel(IntTag);
    Associations.hasMany.call(IntAuthor, "int_memberships", {
      className: "IntMembership",
      foreignKey: "int_author_id",
    });
    Associations.hasMany.call(IntAuthor, "int_tags", {
      className: "IntTag",
      through: "int_memberships",
      source: "int_tag",
    });
    Associations.belongsTo.call(IntMembership, "int_tag", {
      className: "IntTag",
      foreignKey: "int_tag_id",
    });

    const alice = await IntAuthor.create({ name: "Alice" });
    const bob = await IntAuthor.create({ name: "Bob" });
    const ruby = await IntTag.create({ label: "ruby" });
    const ts = await IntTag.create({ label: "typescript" });
    const go = await IntTag.create({ label: "go" });
    await IntMembership.create({ int_author_id: alice.id, int_tag_id: ruby.id });
    await IntMembership.create({ int_author_id: alice.id, int_tag_id: ts.id });
    await IntMembership.create({ int_author_id: bob.id, int_tag_id: go.id });

    const reflection = (IntAuthor as any)._reflectOnAssociation("int_tags");
    const tags: IntTag[] = await (
      AssociationScope.scope({
        owner: alice,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toArray();
    expect(tags.map((t) => t.label).sort()).toEqual(["ruby", "typescript"]);
  });

  it("hasOne :through chain emits a JOIN with LIMIT 1", () => {
    class HotUser extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class HotAccount extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("hot_user_id", "integer");
        this.adapter = adapter;
      }
    }
    class HotSettings extends Base {
      static {
        this.attribute("hot_account_id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(HotUser);
    registerModel(HotAccount);
    registerModel(HotSettings);
    Associations.hasOne.call(HotUser, "hot_account", {
      className: "HotAccount",
      foreignKey: "hot_user_id",
    });
    Associations.hasOne.call(HotUser, "hot_settings", {
      className: "HotSettings",
      through: "hot_account",
    });
    Associations.hasOne.call(HotAccount, "hot_settings", {
      className: "HotSettings",
      foreignKey: "hot_account_id",
    });

    const user = new HotUser({ id: 5 });
    const reflection = (HotUser as any)._reflectOnAssociation("hot_settings");
    const sql = (
      AssociationScope.scope({
        owner: user,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toSql();
    expect(sql).toMatch(/FROM\s+"hot_settings"/);
    expect(sql).toMatch(/INNER JOIN\s+"?hot_accounts"?/i);
    // Pin the ON condition so a regression where the join keys flip
    // (or get dropped) doesn't slip through. PR 3 builds these via
    // _nextChainScope using joinPrimaryKey / joinForeignKey from the
    // chain's pair.
    expect(sql).toMatch(/ON\s+"hot_settings"\."hot_account_id"\s*=\s*"hot_accounts"\."id"/);
    expect(sql).toMatch(/"hot_accounts"\."hot_user_id"\s*=\s*5/);
    expect(sql).toMatch(/LIMIT\s+1/);
  });

  it("through chain emits a JOIN-based query against the through table", () => {
    // PR 3: chain length 2 (a has_many :through). The generated SQL
    // selects from the source table, INNER JOINs the through table, and
    // table-qualifies the owner-FK WHERE on the through.
    //   SELECT through_posts.* FROM through_posts
    //   INNER JOIN through_memberships
    //     ON through_posts.id = through_memberships.through_post_id
    //   WHERE through_memberships.through_author_id = 1
    class ThroughAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    class ThroughMembership extends Base {
      static {
        this.attribute("through_author_id", "integer");
        this.attribute("through_post_id", "integer");
        this.adapter = adapter;
      }
    }
    class ThroughPost extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    registerModel(ThroughAuthor);
    registerModel(ThroughMembership);
    registerModel(ThroughPost);
    Associations.hasMany.call(ThroughAuthor, "through_memberships", {
      className: "ThroughMembership",
      foreignKey: "through_author_id",
    });
    Associations.hasMany.call(ThroughAuthor, "through_posts", {
      className: "ThroughPost",
      through: "through_memberships",
    });
    Associations.belongsTo.call(ThroughMembership, "through_post", {
      className: "ThroughPost",
      foreignKey: "through_post_id",
    });

    const author = new ThroughAuthor({ id: 1 });
    const reflection = (ThroughAuthor as any)._reflectOnAssociation("through_posts");
    const sql = (
      AssociationScope.scope({
        owner: author,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toSql();
    expect(sql).toMatch(/FROM\s+"through_posts"/);
    expect(sql).toMatch(/INNER JOIN\s+"?through_memberships"?/i);
    expect(sql).toMatch(/"through_posts"\."id"\s*=\s*"through_memberships"\."through_post_id"/);
    expect(sql).toMatch(/"through_memberships"\."through_author_id"\s*=\s*1/);
  });
});
