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

  it("static scope() routes through this.INSTANCE (subclass dispatch)", async () => {
    const { DisableJoinsAssociationScope } = await import("./disable-joins-association-scope.js");
    expect(DisableJoinsAssociationScope.INSTANCE).toBeInstanceOf(DisableJoinsAssociationScope);
    // Subclass INSTANCE shadows the parent's so polymorphic
    // this.INSTANCE in `static scope` resolves to the subclass instance.
    expect(DisableJoinsAssociationScope.INSTANCE).not.toBe(AssociationScope.INSTANCE);
  });

  it("scope() raises for through chains (PR 1 limitation)", () => {
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
    expect(() =>
      AssociationScope.scope({
        owner: author,
        reflection,
        klass: reflection.klass,
      }),
    ).toThrow(/multi-step association chains/);
  });
});
