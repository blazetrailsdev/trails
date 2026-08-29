import type { AssociationProxy } from "./collection-proxy.js";
import { describe, it, expect } from "vitest";
import { Base, registerModel, registerSubclass } from "../index.js";
import { Associations } from "../associations.js";
import { loadSingularTarget } from "../test-helpers/load-singular-target.js";
import { findCollectionTarget as findTarget } from "../test-helpers/find-collection-target.js";
import { AssociationScope, ReflectionProxy } from "./association-scope.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import "../test-helpers/models/company.js";
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
  fixtures([]);
  registerModel(Author);
  registerModel(Post);
  registerModel(Comment);
  registerModel(Category);
  registerModel(Categorization);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(Member);
  registerModel(Membership);
  void CurrentMembership;
  registerModel(Club);
  registerModel(MemberDetail);

  function makeModels() {
    class AsAuthor extends Base {
      declare name: string | null;
      declare as_posts: AssociationProxy<AsPost>;

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
      declare as_author_id: number | null;
      declare title: string | null;
      declare as_author: AsAuthor | null;
      declare loadBelongsTo: (name: "as_author") => Promise<AsAuthor | null>;

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
    expect(typeof AssociationScope.scope).toBe("function");
  });

  it("create(valueTransformation) accepts a custom transformer", () => {
    const upcased = AssociationScope.create((v: unknown) =>
      typeof v === "string" ? v.toUpperCase() : v,
    );
    expect(upcased).toBeInstanceOf(AssociationScope);
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
    expect(sql).toMatch(/["`]as_authors["`].*["`]id["`]\s*=\s*42.*LIMIT\s+1/s);
  });

  it("getBindValues collects owner's join_foreign_key values (chain length 1)", () => {
    const { AsAuthor } = makeModels();
    const author = new AsAuthor({ id: 99, name: "Bob" });
    const reflection = (AsAuthor as any)._reflectOnAssociation("as_posts");

    const binds = AssociationScope.getBindValues(author, [reflection]);
    expect(binds).toEqual([99]);
  });

  it("ReflectionProxy delegates joinPrimaryKey / joinForeignKey / klass to the reflection", () => {
    const { AsAuthor, AsPost } = makeModels();
    const reflection = (AsAuthor as any)._reflectOnAssociation("as_posts");
    const proxy = new ReflectionProxy(reflection, null);

    expect(proxy.joinPrimaryKey()).toBe(reflection.joinPrimaryKey());
    expect(proxy.joinForeignKey).toBe(reflection.joinForeignKey);
    expect(proxy.klass).toBe(AsPost);
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
      declare count_author_id: number | null;
      declare published: boolean | null;

      static {
        this.attribute("count_author_id", "integer");
        this.attribute("published", "boolean");
      }
    }
    registerModel(CountAuthor);
    registerModel(CountPost);
    Associations.hasMany.call(
      CountAuthor,
      "count_posts",
      (rel: any) => {
        calls++;
        return rel.where({ published: true });
      },
      {
        className: "CountPost",
        foreignKey: "count_author_id",
      },
    );

    const author = new CountAuthor({ id: 5 });
    const reflection = (CountAuthor as any)._reflectOnAssociation("count_posts");
    const scope: any = AssociationScope.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    });

    expect(calls).toBe(1);
    expect(scope.toSql()).toMatch(/["`]published["`]\s*=\s*(?:TRUE|1)/i);
  });

  it("applies STI type_condition on subclass targets (compensates for our unscoped)", () => {
    class StiOwner extends Base {
      declare very_special_clients: AssociationProxy<Base>;

      static {
        this._tableName = "owners";
        this._primaryKey = "owner_id";
        this.hasMany("very_special_clients", {
          className: "VerySpecialClient",
          foreignKey: "client_of",
        });
      }
    }
    registerModel(StiOwner);

    const owner = new StiOwner({ owner_id: 3 });
    const reflection = (StiOwner as any)._reflectOnAssociation("very_special_clients");
    const scope: any = AssociationScope.scope({
      owner,
      reflection,
      klass: reflection.klass,
    });

    expect(scope.toSql()).toMatch(/["`]type["`]\s*=\s*'VerySpecialClient'/);
  });

  it("loadHasMany merges target's scope_for_association (default_scope flows through)", async () => {
    class DsAuthor extends Base {
      declare ds_posts: AssociationProxy<DsPost>;

      static {
        this.attribute("id", "integer");
        this.hasMany("ds_posts", {
          className: "DsPost",
          foreignKey: "ds_author_id",
        });
      }
    }
    class DsPost extends Base {
      declare ds_author_id: number | null;
      declare published: boolean | null;

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
    const author = await Author.create({ name: "Alice" });
    await Post.create({ author_id: author.id, title: "draft", body: "x" });
    await Post.create({ author_id: author.id, title: "Welcome to the weblog", body: "y" });

    const results = await findTarget(author, "welcomePosts");
    expect(results).toHaveLength(1);
    expect((results[0] as any).title).toBe("Welcome to the weblog");
  });

  it("invokes 0-arity scope lambda with this=relation (Rails instance_exec semantics)", () => {
    class ZeroArityAuthor extends Base {
      declare zero_arity_posts: AssociationProxy<ZeroArityPost>;

      static {
        this.attribute("id", "integer");
        this.hasMany(
          "zero_arity_posts",
          function (this: any) {
            return this.where({ active: true });
          },
          {
            className: "ZeroArityPost",
            foreignKey: "zero_arity_author_id",
          },
        );
      }
    }
    class ZeroArityPost extends Base {
      declare zero_arity_author_id: number | null;
      declare active: boolean | null;

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
    class AsOwner extends Base {
      declare as_comments: AssociationProxy<AsComment>;

      static {
        this.attribute("id", "integer");
        this.hasMany("as_comments", {
          className: "AsComment",
          as: "commentable",
        });
      }
    }
    class AsComment extends Base {
      declare commentable_id: number | null;
      declare commentable_type: string | null;

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
    class StiAsOwner extends Base {
      declare "type": string | null;

      static {
        this.attribute("id", "integer");
        this.attribute("type", "string");
      }
    }
    class StiAsSubOwner extends StiAsOwner {}
    StiAsOwner.inheritanceColumn = "type";
    registerSubclass(StiAsSubOwner);
    class StiAsComment extends Base {
      declare commentable_id: number | null;
      declare commentable_type: string | null;

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
      declare as_one_image: AsOneImage | null;
      declare loadHasOne: (name: "as_one_image") => Promise<AsOneImage | null>;

      static {
        this.attribute("id", "integer");
        this.hasOne("as_one_image", {
          className: "AsOneImage",
          as: "imageable",
        });
      }
    }
    class AsOneImage extends Base {
      declare imageable_id: number | null;
      declare imageable_type: string | null;

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
    class PolyTarget extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    class PolyComment extends Base {
      declare commentable_id: number | null;
      declare commentable_type: string | null;
      declare commentable: Base | null;
      declare loadBelongsTo: (name: "commentable") => Promise<Base | null>;

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
    expect(sql).toMatch(/["`]poly_targets["`]/);
    expect(sql).toMatch(/["`]id["`]\s*=\s*99/);
    expect(sql).toMatch(/LIMIT\s+1/);
  });

  it("addConstraints routes a composite-PK mismatch through checkValidityBang", async () => {
    const { CompositePrimaryKeyMismatchError } = await import("../index.js");
    class AscCpkBook extends Base {
      declare broken_order_id: number | null;

      static {
        this.attribute("broken_order_id", "integer");
      }
    }
    class AscCpkBrokenOrder extends Base {
      declare shop_id: number | null;
      declare status: string | null;
      declare books: AssociationProxy<AscCpkBook>;

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
    class UuidTarget extends Base {
      declare uuid: string | null;

      static {
        this.attribute("uuid", "string");
        this.primaryKey = "uuid";
      }
    }
    class UuidComment extends Base {
      declare commentable_id: string | null;
      declare commentable_type: string | null;
      declare commentable: Base | null;
      declare loadBelongsTo: (name: "commentable") => Promise<Base | null>;

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
    expect(sql).toMatch(/["`]uuid["`]\s*=\s*'abc-123'/);
    expect(sql).not.toMatch(/["`]id["`]\s*=/);
  });

  it("through chain merges scope on the through reflection (chain.reverse_each)", () => {
    class CcAuthor extends Base {
      declare cc_memberships: AssociationProxy<CcMembership>;
      declare cc_tags: AssociationProxy<CcTag>;

      static {
        this.attribute("id", "integer");
        this.hasMany("cc_memberships", (rel: any) => rel.where({ active: true }), {
          className: "CcMembership",
          foreignKey: "cc_author_id",
        });
        this.hasMany("cc_tags", {
          className: "CcTag",
          through: "cc_memberships",
          source: "cc_tag",
        });
      }
    }
    class CcMembership extends Base {
      declare cc_author_id: number | null;
      declare cc_tag_id: number | null;
      declare active: boolean | null;
      declare cc_tag: CcTag | null;
      declare loadBelongsTo: (name: "cc_tag") => Promise<CcTag | null>;

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
    const tag = await Tag.create({ name: "ruby" });
    const post = await Post.create({ title: "p1", body: "b" });
    const comment = await Comment.create({ post_id: post.id, body: "c1" });
    await Tagging.create({ tag_id: tag.id, taggable_id: post.id, taggable_type: "Post" });
    await Tagging.create({
      tag_id: tag.id,
      taggable_id: comment.id,
      taggable_type: "Comment",
    });

    const posts = (await (tag as any).taggedPosts.toArray()) as Post[];
    expect(posts.map((p) => p.title)).toEqual(["p1"]);
  });

  it.skip("loadHasMany through with sourceType + non-id target PK uses correct join column", async () => {});

  it("loadHasOne through with hasOne source routes via AssociationScope and returns one record", async () => {
    const member = await Member.create({ name: "Alice" });
    const membership = await Membership.create({ member_id: member.id });
    const memberDetail = await MemberDetail.create({ member_id: member.id });

    const loaded = (await loadSingularTarget(memberDetail, "membership")) as Membership | null;
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(membership.id);
  });

  it("loadHasMany through with has_many source routes via AssociationScope (PR 3c widening)", async () => {
    const author = await Author.create({ name: "Alice" });
    const p1 = await Post.create({ author_id: author.id, title: "p1", body: "b" });
    const p2 = await Post.create({ author_id: author.id, title: "p2", body: "b" });
    await Comment.create({ post_id: p1.id, body: "first" });
    await Comment.create({ post_id: p2.id, body: "second" });
    const other = await Author.create({ name: "Bob" });
    const op = await Post.create({ author_id: other.id, title: "op", body: "b" });
    await Comment.create({ post_id: op.id, body: "other" });

    const comments = (await (author as any).comments.toArray()) as Comment[];
    expect(comments.map((c) => c.body).sort()).toEqual(["first", "second"]);
  });

  it("loadHasOne through chain (belongsTo source) routes via AssociationScope and returns one record", async () => {
    const member = await Member.create({ name: "Alice" });
    const club = await Club.create({ name: "Great club" });
    await CurrentMembership.create({ member_id: member.id, club_id: club.id });

    const loaded = (await loadSingularTarget(member, "club")) as Club | null;
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Great club");
  });

  it("loadHasMany through chain (belongsTo source, no sourceType) routes via AssociationScope", async () => {
    const alice = await Author.create({ name: "Alice" });
    const bob = await Author.create({ name: "Bob" });
    const ruby = await Category.create({ name: "ruby" });
    const ts = await Category.create({ name: "typescript" });
    const go = await Category.create({ name: "go" });
    await Categorization.create({ author_id: alice.id, category_id: ruby.id });
    await Categorization.create({ author_id: alice.id, category_id: ts.id });
    await Categorization.create({ author_id: bob.id, category_id: go.id });

    const categories = (await (alice as any).categories.toArray()) as Category[];
    expect(categories.map((c) => c.name).sort()).toEqual(["ruby", "typescript"]);
  });

  it("through chain query loads actual records end-to-end (Author -> Memberships -> Tags)", async () => {
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
      declare hot_account: HotAccount | null;
      declare hot_settings: HotSettings | null;
      declare loadHasOne: ((name: "hot_account") => Promise<HotAccount | null>) &
        ((name: "hot_settings") => Promise<HotSettings | null>);

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
      declare hot_user_id: number | null;
      declare hot_settings: HotSettings | null;
      declare loadHasOne: (name: "hot_settings") => Promise<HotSettings | null>;

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
      declare hot_account_id: number | null;

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
    expect(sql).toMatch(
      /ON\s+["`]hot_settings["`]\.["`]hot_account_id["`]\s*=\s*["`]hot_accounts["`]\.["`]id["`]/,
    );
    expect(sql).toMatch(/["`]hot_accounts["`]\.["`]hot_user_id["`]\s*=\s*5/);
    expect(sql).toMatch(/LIMIT\s+1/);
  });

  it("through chain emits a JOIN-based query against the through table", () => {
    class ThroughAuthor extends Base {
      declare through_memberships: AssociationProxy<ThroughMembership>;
      declare through_posts: AssociationProxy<ThroughPost>;

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
      declare through_author_id: number | null;
      declare through_post_id: number | null;
      declare through_post: ThroughPost | null;
      declare loadBelongsTo: (name: "through_post") => Promise<ThroughPost | null>;

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
    class PstGallery extends Base {
      declare pst_gallery_id: number | null;
      declare imageable_id: number | null;
      declare imageable_type: string | null;
      declare children: AssociationProxy<PstGallery>;
      declare imageable: Base | null;
      declare imageables: AssociationProxy<PstGallery>;
      declare loadBelongsTo: (name: "imageable") => Promise<Base | null>;

      static {
        this._tableName = "pst_galleries";
        this.attribute("id", "integer");
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
    expect(sql).toMatch(/INNER JOIN\s+["`]pst_galleries["`]\s+["`]children_imageables["`]/i);
    expect(sql).toMatch(/["`]children_imageables["`]\.["`]pst_gallery_id["`]\s*=\s*5/);
    expect(sql).toMatch(/["`]children_imageables["`]\.["`]imageable_type["`]\s*=\s*'PstGallery'/);
    expect(sql).not.toMatch(/["`]pst_galleries["`]\.["`]imageable_type["`]/);
  });
});
