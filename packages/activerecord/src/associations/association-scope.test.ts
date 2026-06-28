import { describe, it, expect } from "vitest";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import { Associations, loadHasMany, loadHasOne } from "../associations.js";
import { AssociationScope, ReflectionProxy } from "./association-scope.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Member } from "../test-helpers/models/member.js";
import { Membership, CurrentMembership } from "../test-helpers/models/membership.js";
import { Club } from "../test-helpers/models/club.js";
import { MemberDetail } from "../test-helpers/models/member-detail.js";

describe("AssociationScope", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  // The DB-roundtrip cases ride the canonical Author/Post/Comment,
  // Categorization/Category, Tag/Tagging and Member/Membership/Club models —
  // every STI / polymorphic-source-type / has-many-through / has-one-through
  // shape this resolver harness exercises already lives on those models. The
  // pure `toSql()` cases below build inline single-purpose classes that never
  // touch the DB, so they need no schema.
  registerModel(Author);
  registerModel(Post);
  registerModel(Comment);
  registerModel(Category);
  registerModel(Categorization);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(Member);
  registerModel(Membership);
  void CurrentMembership; // self-registers as an STI subclass on import
  registerModel(Club);
  registerModel(MemberDetail);

  function makeModels() {
    class AsAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.hasMany("as_posts", {
          className: "AsPost",
          foreignKey: "as_author_id",
        });
      }
    }
    class AsPost extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("as_author_id", "integer");
        this.attribute("title", "string");
        this.belongsTo("as_author", {
          className: "AsAuthor",
          foreignKey: "as_author_id",
        });
      }
    }
    registerModel(AsAuthor);
    registerModel(AsPost);
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
    expect(sql).toMatch(/["`]as_posts["`].*["`]as_author_id["`]\s*=\s*7/s);
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
    expect(sql).toMatch(/["`]as_authors["`].*["`]id["`]\s*=\s*42.*LIMIT\s+1/s);
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
      }
    }
    let calls = 0;
    class CountPost extends Base {
      static {
        this.attribute("count_author_id", "integer");
        this.attribute("published", "boolean");
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

    // The lambda must run exactly once — addConstraints applies it via
    // reflection.scope; the loader path must not re-apply options.scope.
    expect(calls).toBe(1);
    expect(scope.toSql()).toMatch(/["`]published["`]\s*=\s*(?:TRUE|1)/i);
  });

  it("applies STI type_condition on subclass targets (compensates for our unscoped)", () => {
    // Rails' klass.unscoped applies STI type_condition via core.rb's
    // relation() override; ours doesn't, so AssociationScope re-adds it.
    class StiOwner extends Base {
      static {
        this.attribute("id", "integer");
        this.hasMany("sti_specials", {
          className: "StiSpecial",
          foreignKey: "sti_owner_id",
        });
      }
    }
    class StiBase extends Base {
      static {
        this.attribute("type", "string");
        this.attribute("sti_owner_id", "integer");
        this._tableName = "sti_things";
        enableSti(StiBase);
      }
    }
    class StiSpecial extends StiBase {
      static {
        registerModel(StiSpecial);
        registerSubclass(StiSpecial);
      }
    }
    registerModel(StiOwner);
    registerModel(StiBase);

    const owner = new StiOwner({ id: 3 });
    const reflection = (StiOwner as any)._reflectOnAssociation("sti_specials");
    const scope: any = AssociationScope.scope({
      owner,
      reflection,
      klass: reflection.klass,
    });

    expect(scope.toSql()).toMatch(/["`]type["`]\s*=\s*'StiSpecial'/);
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
        this.hasMany("ds_posts", {
          className: "DsPost",
          foreignKey: "ds_author_id",
        });
      }
    }
    class DsPost extends Base {
      static {
        this.attribute("ds_author_id", "integer");
        this.attribute("published", "boolean");
        this.defaultScope((rel: any) => rel.where({ published: true }));
      }
    }
    registerModel(DsAuthor);
    registerModel(DsPost);

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
    expect(sql).toMatch(/["`]published["`]\s*=\s*(?:TRUE|1)/i);
    expect(sql).toMatch(/["`]ds_author_id["`]\s*=\s*1/);
  });

  it("loadHasMany applies caller-supplied options.scope when it differs from reflection.scope", async () => {
    // Regression for the loadHasManyThrough path that wraps options.scope
    // with sourceType filtering before calling loadHasMany. The migrated
    // path skips re-applying when options.scope === reflection.scope
    // (avoid double-application), but augmented scopes must still run.
    // Canonical Author has_many :posts carries no macro scope, so the
    // caller-supplied `where(title:)` is necessarily an augmented scope.
    const author = await Author.create({ name: "Alice" });
    await Post.create({ author_id: author.id, title: "draft", body: "x" });
    await Post.create({ author_id: author.id, title: "published", body: "y" });

    // Augmented options.scope — NOT equal to the reflection's macro
    // scope (which is null here). Loader must still apply it.
    const results = await loadHasMany(author, "posts", {
      className: "Post",
      foreignKey: "author_id",
      scope: (rel: any) => rel.where({ title: "published" }),
    });
    expect(results).toHaveLength(1);
    expect((results[0] as any).title).toBe("published");
  });

  it("invokes 0-arity scope lambda with this=relation (Rails instance_exec semantics)", () => {
    // Rails: `relation.instance_exec(owner, &scope) || relation`. A
    // 0-arity scope (e.g. `-> { where(active: true) }`) reads `self`
    // as the relation, so we must bind `this` rather than passing the
    // relation as the first arg.
    class ZeroArityAuthor extends Base {
      static {
        this.attribute("id", "integer");
        this.hasMany("zero_arity_posts", {
          className: "ZeroArityPost",
          foreignKey: "zero_arity_author_id",
          // The function's .length is 0, so the loader must use scopeFor's
          // 0-arity branch (this=relation). If we passed it as a 1-arg
          // function, `where` would not exist on the empty arg.
          scope: function (this: any) {
            return this.where({ active: true });
          },
        });
      }
    }
    class ZeroArityPost extends Base {
      static {
        this.attribute("zero_arity_author_id", "integer");
        this.attribute("active", "boolean");
      }
    }
    registerModel(ZeroArityAuthor);
    registerModel(ZeroArityPost);

    const owner = new ZeroArityAuthor({ id: 1 });
    const reflection = (ZeroArityAuthor as any)._reflectOnAssociation("zero_arity_posts");
    const sql = (
      AssociationScope.scope({ owner, reflection, klass: reflection.klass }) as any
    ).toSql();
    expect(sql).toMatch(/["`]active["`]\s*=\s*(?:TRUE|1)/i);
  });

  it("hasMany :as adds the polymorphic type WHERE on the target table", () => {
    // For `hasMany :comments, as: :commentable`, Rails' AssociationScope
    // builds `WHERE comments.commentable_id = owner.id AND
    // comments.commentable_type = OwnerClass.name`. The type filter
    // comes from reflection.type === foreignType (`commentable_type`).
    class AsOwner extends Base {
      static {
        this.attribute("id", "integer");
        this.hasMany("as_comments", {
          className: "AsComment",
          as: "commentable",
        });
      }
    }
    class AsComment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
      }
    }
    registerModel(AsOwner);
    registerModel(AsComment);
    const owner = new AsOwner({ id: 7 });
    const reflection = (AsOwner as any)._reflectOnAssociation("as_comments");
    const sql = (
      AssociationScope.scope({ owner, reflection, klass: reflection.klass }) as any
    ).toSql();
    expect(sql).toMatch(/["`]commentable_id["`]\s*=\s*7/);
    expect(sql).toMatch(/["`]commentable_type["`]\s*=\s*'AsOwner'/);
  });

  it("hasMany :as polymorphic type WHERE uses base class polymorphic_name for STI subclass owner", () => {
    // Rails' AssociationScope builds the type filter from
    // `owner.class.polymorphic_name` (= base_class.name), so an STI subclass
    // owner stores the base class name in the *_type column, not the subclass.
    class StiAsOwner extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("type", "string");
      }
    }
    class StiAsSubOwner extends StiAsOwner {}
    enableSti(StiAsOwner);
    registerSubclass(StiAsSubOwner);
    class StiAsComment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
      }
    }
    registerModel(StiAsOwner);
    registerModel(StiAsSubOwner);
    registerModel(StiAsComment);
    Associations.hasMany.call(StiAsSubOwner, "as_comments", {
      className: "StiAsComment",
      as: "commentable",
    });
    const owner = new StiAsSubOwner({ id: 7 });
    const reflection = (StiAsSubOwner as any)._reflectOnAssociation("as_comments");
    const sql = (
      AssociationScope.scope({ owner, reflection, klass: reflection.klass }) as any
    ).toSql();
    expect(sql).toMatch(/["`]commentable_type["`]\s*=\s*'StiAsOwner'/);
  });

  it("hasOne :as adds the polymorphic type WHERE plus LIMIT 1", () => {
    class AsOneOwner extends Base {
      static {
        this.attribute("id", "integer");
        this.hasOne("as_one_image", {
          className: "AsOneImage",
          as: "imageable",
        });
      }
    }
    class AsOneImage extends Base {
      static {
        this.attribute("imageable_id", "integer");
        this.attribute("imageable_type", "string");
      }
    }
    registerModel(AsOneOwner);
    registerModel(AsOneImage);
    const owner = new AsOneOwner({ id: 3 });
    const reflection = (AsOneOwner as any)._reflectOnAssociation("as_one_image");
    const sql = (
      AssociationScope.scope({ owner, reflection, klass: reflection.klass }) as any
    ).toSql();
    expect(sql).toMatch(/["`]imageable_id["`]\s*=\s*3/);
    expect(sql).toMatch(/["`]imageable_type["`]\s*=\s*'AsOneOwner'/);
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
      }
    }
    class PolyComment extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
        this.belongsTo("commentable", { polymorphic: true });
      }
    }
    registerModel(PolyTarget);
    registerModel(PolyComment);
    const comment = new PolyComment({ commentable_id: 99, commentable_type: "PolyTarget" });
    const reflection = (PolyComment as any)._reflectOnAssociation("commentable");
    const sql = (
      AssociationScope.scope({ owner: comment, reflection, klass: PolyTarget }) as any
    ).toSql();
    // Target side: WHERE poly_targets.id = 99 (the FK value), LIMIT 1.
    expect(sql).toMatch(/["`]poly_targets["`]/);
    expect(sql).toMatch(/["`]id["`]\s*=\s*99/);
    expect(sql).toMatch(/LIMIT\s+1/);
  });

  it("loadHasMany rejects composite primary key with :as polymorphic", async () => {
    // A composite owner PK without an "id" component cannot collapse to a
    // scalar <as>_id value — reject with CompositePrimaryKeyMismatchError.
    // (When the CPK includes "id", it collapses to "id" matching Rails'
    // join_id_for; only the no-id case is unrepresentable.)
    const { loadHasMany, CompositePrimaryKeyMismatchError } = await import("../index.js");
    class CpkAsOwner extends Base {
      static {
        this.attribute("a", "integer");
        this.attribute("b", "integer");
        this.primaryKey = ["a", "b"];
      }
    }
    class CpkAsTarget extends Base {
      static {
        this.attribute("commentable_id", "integer");
        this.attribute("commentable_type", "string");
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

  it("addConstraints routes a composite-PK mismatch through checkValidityBang", async () => {
    // The scope-building bypass path (AssociationScope.scope → addConstraints)
    // never constructs an Association, so it doesn't reach the canonical
    // `reflection.check_validity!` that `Association#initialize` runs. The
    // length guard now routes through the real reflection's checkValidityBang
    // so the error carries the Rails-faithful message derived from
    // active_record_primary_key / foreign_key — note the FK renders as the
    // reflection's scalar `broken_order_id`, NOT the trails-computed
    // `["broken_order_id"]` array the old guard produced.
    const { CompositePrimaryKeyMismatchError } = await import("../index.js");
    class AscCpkBook extends Base {
      static {
        this.attribute("broken_order_id", "integer");
      }
    }
    class AscCpkBrokenOrder extends Base {
      static {
        this.attribute("shop_id", "integer");
        this.attribute("status", "string");
        this.primaryKey = ["shop_id", "status"];
        this.hasMany("books", { className: "AscCpkBook", foreignKey: "broken_order_id" });
      }
    }
    registerModel(AscCpkBook);
    registerModel(AscCpkBrokenOrder);
    const owner = new AscCpkBrokenOrder({ shop_id: 1, status: "active" });
    const reflection = (AscCpkBrokenOrder as any)._reflectOnAssociation("books");
    let error: Error | undefined;
    try {
      AssociationScope.scope({ owner, reflection, klass: AscCpkBook });
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(CompositePrimaryKeyMismatchError);
    expect(error?.message).toBe(
      `Association AscCpkBrokenOrder#books primary key ["shop_id", "status"] doesn't match with foreign key broken_order_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
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
      }
    }
    class UuidComment extends Base {
      static {
        this.attribute("commentable_id", "string");
        this.attribute("commentable_type", "string");
        this.belongsTo("commentable", { polymorphic: true });
      }
    }
    registerModel(UuidTarget);
    registerModel(UuidComment);
    const comment = new UuidComment({
      commentable_id: "abc-123",
      commentable_type: "UuidTarget",
    });
    const reflection = (UuidComment as any)._reflectOnAssociation("commentable");
    const sql = (
      AssociationScope.scope({ owner: comment, reflection, klass: UuidTarget }) as any
    ).toSql();
    // Must WHERE on uuid (the target's actual PK), NOT id.
    expect(sql).toMatch(/["`]uuid["`]\s*=\s*'abc-123'/);
    expect(sql).not.toMatch(/["`]id["`]\s*=/);
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
        this.hasMany("cc_memberships", {
          className: "CcMembership",
          foreignKey: "cc_author_id",
          // Scope on the through reflection — chain.reverse_each must pick
          // it up when AssociationScope walks the chain for cc_tags.
          scope: (rel: any) => rel.where({ active: true }),
        });
        this.hasMany("cc_tags", {
          className: "CcTag",
          through: "cc_memberships",
          source: "cc_tag",
        });
      }
    }
    class CcMembership extends Base {
      static {
        this.attribute("cc_author_id", "integer");
        this.attribute("cc_tag_id", "integer");
        this.attribute("active", "boolean");
        this.belongsTo("cc_tag", {
          className: "CcTag",
          foreignKey: "cc_tag_id",
        });
      }
    }
    class CcTag extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    registerModel(CcAuthor);
    registerModel(CcMembership);
    registerModel(CcTag);

    const author = new CcAuthor({ id: 1 });
    const reflection = (CcAuthor as any)._reflectOnAssociation("cc_tags");
    const sql = (
      AssociationScope.scope({
        owner: author,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toSql();
    expect(sql).toMatch(/INNER JOIN\s+["`]?cc_memberships["`]?/i);
    expect(sql).toMatch(/["`]cc_memberships["`]\.["`]cc_author_id["`]\s*=\s*1/);
    expect(sql).toMatch(/["`]cc_memberships["`]\.["`]active["`]\s*=\s*(?:TRUE|1)/i);
  });

  it("loadHasMany through with sourceType filters by polymorphic source type (PR 3c)", async () => {
    // Tagging belongs_to :taggable, polymorphic: true (the Tagging model
    // holds the polymorphic FK + type pair). When we hop through taggings
    // with a sourceType filter (Tag has_many :taggedPosts, through:
    // :taggings, source: :taggable, sourceType: "Post"),
    // PolymorphicReflection wraps the chain entry and adds a type
    // constraint `where(taggable_type: sourceType)`. PR 3c's
    // _mergeReflectionScopeChain detects PolymorphicReflection and
    // applies its constraints() — including the source_type_scope —
    // to the chain JOIN so only the right polymorphic rows match.
    const tag = await Tag.create({ name: "ruby" });
    const post = await Post.create({ title: "p1", body: "b" });
    const comment = await Comment.create({ post_id: post.id, body: "c1" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({
      tag_id: tag.id,
      taggable_id: comment.id,
      taggable_type: "Comment",
    });

    const posts = (await loadHasMany(tag, "taggedPosts", {
      className: "Post",
      through: "taggings",
      source: "taggable",
      sourceType: "Post",
    })) as Post[];
    // Without sourceType filtering, the through join would return BOTH
    // tagging rows; we'd then JOIN to the wrong rows. With the filter,
    // only the Post-typed tagging participates.
    expect(posts.map((p) => p.title)).toEqual(["p1"]);
  });

  // story: association-scope-test-np-uuid-canonical (np_* tables have no schema.rb analog)
  it.skip("loadHasMany through with sourceType + non-id target PK uses correct join column", async () => {});

  it("loadHasOne through with hasOne source routes via AssociationScope and returns one record", async () => {
    // PR 3c also covers hasOne source on the through model. Canonical
    // MemberDetail has_one :membership through :member, where Member
    // has_one :membership — so the source (`membership`) is a hasOne, not
    // a belongsTo. Verifies the join direction differs from belongsTo-
    // source — target's FK back to through, not the other way — and that
    // loadHasOne returns exactly one record.
    const member = await Member.create({ name: "Alice" });
    const membership = await Membership.create({ member_id: member.id });
    const memberDetail = await MemberDetail.create({ member_id: member.id });

    const loaded = (await loadHasOne(memberDetail, "membership", {
      className: "Membership",
      through: "member",
      source: "membership",
    })) as Membership | null;
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(membership.id);
  });

  it("loadHasMany through with has_many source routes via AssociationScope (PR 3c widening)", async () => {
    // Canonical Author has_many :posts; Post has_many :comments; Author
    // has_many :comments, through: :posts (source: :comments → has_many on
    // Post, NOT belongsTo). PR 3b only routed belongsTo-source shapes; PR
    // 3c widens to has_many source — the chain machinery already handles
    // the join direction via reflection.joinPrimaryKey/joinForeignKey
    // delegation, the gate just needed dropping.
    const author = await Author.create({ name: "Alice" });
    const p1 = await Post.create({ author_id: author.id, title: "p1", body: "b" });
    const p2 = await Post.create({ author_id: author.id, title: "p2", body: "b" });
    await Comment.create({ post_id: p1.id, body: "first" });
    await Comment.create({ post_id: p2.id, body: "second" });
    // Another author's comment shouldn't show up
    const other = await Author.create({ name: "Bob" });
    const op = await Post.create({ author_id: other.id, title: "op", body: "b" });
    await Comment.create({ post_id: op.id, body: "other" });

    const comments = (await loadHasMany(author, "comments", {
      className: "Comment",
      through: "posts",
      source: "comments",
    })) as Comment[];
    expect(comments.map((c) => c.body).sort()).toEqual(["first", "second"]);
  });

  it("loadHasOne through chain (belongsTo source) routes via AssociationScope and returns one record", async () => {
    // PR 3b migration covers loadHasOne too. Canonical Member has_one
    // :club through :currentMembership, where CurrentMembership
    // belongs_to :club — the source (`club`) is a belongsTo. End-to-end:
    // insert, call loadHasOne with the through reflection, assert single
    // result.
    const member = await Member.create({ name: "Alice" });
    const club = await Club.create({ name: "Great club" });
    await CurrentMembership.create({ member_id: member.id, club_id: club.id });

    const loaded = (await loadHasOne(member, "club", {
      className: "Club",
      through: "currentMembership",
      source: "club",
    })) as Club | null;
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Great club");
  });

  it("loadHasMany through chain (belongsTo source, no sourceType) routes via AssociationScope", async () => {
    // PR 3b migration: loadHasMany for has_many :through where source
    // is non-polymorphic belongsTo (no sourceType) now routes through
    // AssociationScope's JOIN-based path instead of the 2-step IN-list
    // loader. Canonical Author has_many :categories through
    // :categorizations, where Categorization belongs_to :category.
    // End-to-end: insert records, call loadHasMany, assert the right rows
    // return — exercises the migrated path through real DB.
    const alice = await Author.create({ name: "Alice" });
    const bob = await Author.create({ name: "Bob" });
    const ruby = await Category.create({ name: "ruby" });
    const ts = await Category.create({ name: "typescript" });
    const go = await Category.create({ name: "go" });
    await Categorization.create({ author_id: alice.id, category_id: ruby.id });
    await Categorization.create({ author_id: alice.id, category_id: ts.id });
    await Categorization.create({ author_id: bob.id, category_id: go.id });

    const categories = (await loadHasMany(alice, "categories", {
      className: "Category",
      through: "categorizations",
      source: "category",
    })) as Category[];
    expect(categories.map((c) => c.name).sort()).toEqual(["ruby", "typescript"]);
  });

  it("through chain query loads actual records end-to-end (Author -> Memberships -> Tags)", async () => {
    // Real DB roundtrip: insert records, build the through scope via
    // AssociationScope, execute it, assert the right rows come back.
    // Proves the chain-walking machinery isn't just generating valid-
    // looking SQL — it actually returns the correct records. Canonical
    // Author has_many :categories through :categorizations.
    const alice = await Author.create({ name: "Alice" });
    const bob = await Author.create({ name: "Bob" });
    const ruby = await Category.create({ name: "ruby" });
    const ts = await Category.create({ name: "typescript" });
    const go = await Category.create({ name: "go" });
    await Categorization.create({ author_id: alice.id, category_id: ruby.id });
    await Categorization.create({ author_id: alice.id, category_id: ts.id });
    await Categorization.create({ author_id: bob.id, category_id: go.id });

    const reflection = (Author as any)._reflectOnAssociation("categories");
    const categories: Category[] = await (
      AssociationScope.scope({
        owner: alice,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toArray();
    expect(categories.map((c) => c.name).sort()).toEqual(["ruby", "typescript"]);
  });

  it("hasOne :through chain emits a JOIN with LIMIT 1", () => {
    class HotUser extends Base {
      static {
        this.attribute("id", "integer");
        this.hasOne("hot_account", {
          className: "HotAccount",
          foreignKey: "hot_user_id",
        });
        this.hasOne("hot_settings", {
          className: "HotSettings",
          through: "hot_account",
        });
      }
    }
    class HotAccount extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("hot_user_id", "integer");
        this.hasOne("hot_settings", {
          className: "HotSettings",
          foreignKey: "hot_account_id",
        });
      }
    }
    class HotSettings extends Base {
      static {
        this.attribute("hot_account_id", "integer");
      }
    }
    registerModel(HotUser);
    registerModel(HotAccount);
    registerModel(HotSettings);

    const user = new HotUser({ id: 5 });
    const reflection = (HotUser as any)._reflectOnAssociation("hot_settings");
    const sql = (
      AssociationScope.scope({
        owner: user,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toSql();
    expect(sql).toMatch(/FROM\s+["`]hot_settings["`]/);
    expect(sql).toMatch(/INNER JOIN\s+["`]?hot_accounts["`]?/i);
    // Pin the ON condition so a regression where the join keys flip
    // (or get dropped) doesn't slip through. PR 3 builds these via
    // nextChainScope using joinPrimaryKey / joinForeignKey from the
    // chain's pair.
    expect(sql).toMatch(
      /ON\s+["`]hot_settings["`]\.["`]hot_account_id["`]\s*=\s*["`]hot_accounts["`]\.["`]id["`]/,
    );
    expect(sql).toMatch(/["`]hot_accounts["`]\.["`]hot_user_id["`]\s*=\s*5/);
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
        this.hasMany("through_memberships", {
          className: "ThroughMembership",
          foreignKey: "through_author_id",
        });
        this.hasMany("through_posts", {
          className: "ThroughPost",
          through: "through_memberships",
        });
      }
    }
    class ThroughMembership extends Base {
      static {
        this.attribute("through_author_id", "integer");
        this.attribute("through_post_id", "integer");
        this.belongsTo("through_post", {
          className: "ThroughPost",
          foreignKey: "through_post_id",
        });
      }
    }
    class ThroughPost extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    registerModel(ThroughAuthor);
    registerModel(ThroughMembership);
    registerModel(ThroughPost);

    const author = new ThroughAuthor({ id: 1 });
    const reflection = (ThroughAuthor as any)._reflectOnAssociation("through_posts");
    const sql = (
      AssociationScope.scope({
        owner: author,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toSql();
    expect(sql).toMatch(/FROM\s+["`]through_posts["`]/);
    expect(sql).toMatch(/INNER JOIN\s+["`]?through_memberships["`]?/i);
    expect(sql).toMatch(
      /["`]through_posts["`]\.["`]id["`]\s*=\s*["`]through_memberships["`]\.["`]through_post_id["`]/,
    );
    expect(sql).toMatch(/["`]through_memberships["`]\.["`]through_author_id["`]\s*=\s*1/);
  });

  it("through chain with a polymorphic sourceType that repeats a table aliases the join and keeps the _type WHERE qualified", () => {
    // Polymorphic-source-type variant of the self-referential alias
    // pin in association-scope-alias-tracker.test.ts. A gallery has
    // child galleries; each child `belongsTo :imageable` (polymorphic).
    // `imageables` hops through children with `sourceType: "PstGallery"`,
    // so the source target is the SAME `pst_galleries` table the scope
    // seeds the tracker with — the repeat-visit alias branch fires and
    // the joined-in source gets aliased to `children_imageables`.
    //
    // What this pins that the non-polymorphic case doesn't: the
    // polymorphic source-type filter (`imageable_type = 'PstGallery'`,
    // from the PolymorphicReflection source_type_scope) must qualify the
    // ALIASED through rows — the `imageable_*` columns live on the
    // children, joined in as `children_imageables`, not on the FROM
    // table. Rails evaluates the scope lambda against
    // `reflection.build_scope(reflection.aliased_table)`
    // (association_scope.rb:169, reflection.rb:336/1243), so the
    // `where(imageable_type:)` predicate binds to the alias. Filtering
    // `pst_galleries.imageable_type` (the FROM side) would match the
    // wrong rows.
    class PstGallery extends Base {
      static {
        this._tableName = "pst_galleries";
        this.attribute("pst_gallery_id", "integer");
        this.attribute("imageable_id", "integer");
        this.attribute("imageable_type", "string");
        this.hasMany("children", {
          className: "PstGallery",
          foreignKey: "pst_gallery_id",
        });
        this.belongsTo("imageable", { polymorphic: true });
        this.hasMany("imageables", {
          className: "PstGallery",
          through: "children",
          source: "imageable",
          sourceType: "PstGallery",
        });
      }
    }
    registerModel("PstGallery", PstGallery);

    const owner = new PstGallery({});
    (owner as any).id = 5;
    const reflection = (PstGallery as any)._reflectOnAssociation("imageables");
    const sql = (
      AssociationScope.scope({
        owner,
        reflection,
        klass: reflection.klass,
      }) as any
    ).toSql();
    // The repeat visit to pst_galleries is aliased as the join target.
    expect(sql).toMatch(/INNER JOIN\s+["`]pst_galleries["`]\s+["`]children_imageables["`]/i);
    // Owner-FK WHERE is qualified by the alias, not the bare table.
    expect(sql).toMatch(/["`]children_imageables["`]\.["`]pst_gallery_id["`]\s*=\s*5/);
    // Polymorphic source-type filter qualifies the aliased through rows
    // (Rails' build_scope(reflection.aliased_table)), NOT the FROM table.
    expect(sql).toMatch(/["`]children_imageables["`]\.["`]imageable_type["`]\s*=\s*'PstGallery'/);
    expect(sql).not.toMatch(/["`]pst_galleries["`]\.["`]imageable_type["`]/);
  });
});
