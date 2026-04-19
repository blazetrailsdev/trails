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
