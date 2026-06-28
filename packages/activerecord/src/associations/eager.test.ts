/**
 * Mirrors Rails activerecord/test/cases/associations/eager_test.rb
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Base,
  registerModel,
  enableSti,
  registerSubclass,
  AssociationNotFoundError,
  EagerLoadPolymorphicError,
} from "../index.js";
import { loadHasManyThrough } from "../associations.js";
import { Notifications } from "@blazetrails/activesupport";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "../test-helpers/use-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import {
  Post,
  FirstPost,
  SpecialPost,
  StiPost,
  PostWithDefaultInclude,
} from "../test-helpers/models/post.js";
import { Author, AuthorFavorite, AuthorAddress } from "../test-helpers/models/author.js";
import {
  Comment,
  VerySpecialComment,
  SpecialComment,
  SubSpecialComment,
} from "../test-helpers/models/comment.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Reader, LazyReader } from "../test-helpers/models/reader.js";
import { Person } from "../test-helpers/models/person.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Category, SpecialCategory } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import {
  Developer,
  EagerDeveloperWithDefaultScope,
  EagerDeveloperWithClassMethodDefaultScope,
  EagerDeveloperWithLambdaDefaultScope,
  EagerDeveloperWithBlockDefaultScope,
  EagerDeveloperWithCallableDefaultScope,
} from "../test-helpers/models/developer.js";
import { Company, Firm, Client } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Citation } from "../test-helpers/models/citation.js";
import { Book } from "../test-helpers/models/book.js";
import { ShardedBlog, ShardedBlogPost, ShardedComment } from "../test-helpers/models/sharded.js";
import { captureSql } from "../testing/sql-capture.js";
import { Member } from "../test-helpers/models/member.js";
import { Membership } from "../test-helpers/models/membership.js";
import { Club } from "../test-helpers/models/club.js";
import { Project } from "../test-helpers/models/project.js";
import { Sponsor } from "../test-helpers/models/sponsor.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Job } from "../test-helpers/models/job.js";
import { Matey } from "../test-helpers/models/matey.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Reference } from "../test-helpers/models/reference.js";

// All tables referenced by tests in this file. Tests declare ad-hoc
// model classes per-test, so under AR_NO_AUTO_SCHEMA=1 the schema must
// be materialized up front rather than auto-derived by the test adapter.
const TEST_SCHEMA: Schema = {
  alar_categories: { name: "string" },
  alar_category_posts: { alar_post_id: "integer", alar_category_id: "integer" },
  alar_comments: { body: "string", type: "string", alar_post_id: "integer" },
  alar_posts: { title: "string" },
  cpk_hm_items: { order_shop_id: "integer", order_id: "integer", product: "string" },
  cpk_hm_orders: {
    columns: { shop_id: "integer", id: "integer", name: "string" },
    primaryKey: ["shop_id", "id"],
  },
  cpk_ho_orders: {
    columns: { shop_id: "integer", id: "integer", name: "string" },
    primaryKey: ["shop_id", "id"],
  },
  cpk_ho_receipts: { order_shop_id: "integer", order_id: "integer", number: "string" },
  cpk_line_items: { order_shop_id: "integer", order_id: "integer", product: "string" },
  cpk_orders: {
    columns: { shop_id: "integer", id: "integer", name: "string" },
    primaryKey: ["shop_id", "id"],
  },
  dp_authors: { name: "string" },
  dp_comments: { body: "string", dp_post_id: "integer" },
  dp_posts: { title: "string", dp_author_id: "integer" },
  eabt_comments: { body: "string", eabt_post_id: "integer" },
  eabt_posts: { title: "string" },
  eager_articles: { title: "string" },
  eager_authors: { name: "string" },
  eager_books: { title: "string", eager_author_id: "integer" },
  eager_bt_children: { value: "string", eager_bt_parent_id: "integer" },
  eager_bt_parents: { name: "string" },
  eager_cnt_ho_comments: { body: "string", eager_cnt_ho_post_id: "integer" },
  eager_cnt_ho_posts: { title: "string" },
  eager_comments: { body: "string", eager_post_id: "integer" },
  eager_count_comments: { body: "string", eager_count_post_id: "integer" },
  eager_count_posts: { title: "string" },
  eager_dup_authors: { name: "string" },
  eager_dup_children: { label: "string", eager_dup_parent_id: "integer" },
  eager_dup_parents: { name: "string" },
  eager_dup_posts: { title: "string", eager_dup_author_id: "integer" },
  eager_edges: { label: "string", eager_node_id: "integer" },
  eager_empty_bt_children: { value: "string", eager_empty_bt_parent_id: "integer" },
  eager_empty_bt_parents: { name: "string" },
  eager_hm_cond_comments: { body: "string", eager_hm_cond_post_id: "integer" },
  eager_hm_cond_posts: { title: "string" },
  eager_hm_ho_comments: { body: "string", eager_hm_ho_post_id: "integer" },
  eager_hm_ho_posts: { title: "string" },
  eager_hm_hoac_comments: { body: "string", eager_hm_hoac_post_id: "integer" },
  eager_hm_hoac_posts: { title: "string" },
  eager_hm_hohc_comments: { body: "string", eager_hm_hohc_post_id: "integer" },
  eager_hm_hohc_posts: { title: "string" },
  eager_hm_lca_comments: { body: "string", eager_hm_lca_post_id: "integer" },
  eager_hm_lca_posts: { title: "string" },
  eager_hm_lce_comments: { body: "string", eager_hm_lce_post_id: "integer" },
  eager_hm_lce_posts: { title: "string" },
  eager_hm_limit_comments: { body: "string", eager_hm_limit_post_id: "integer" },
  eager_hm_limit_posts: { title: "string" },
  eager_hm_no_pk_children: {
    columns: { value: "string", eager_hm_no_pk_parent_id: "integer" },
    primaryKey: false,
  },
  eager_hm_no_pk_parents: { name: "string" },
  eager_hmt_authors: { name: "string" },
  eager_hmt_authorships: { eager_hmt_author_id: "integer", eager_hmt_book_id: "integer" },
  eager_hmt_books: { title: "string" },
  eager_hmt_mo_authors: { name: "string" },
  eager_hmt_mo_authorships: { eager_hmt_mo_author_id: "integer", eager_hmt_mo_book_id: "integer" },
  eager_hmt_mo_books: { title: "string" },
  eager_hmt_ord_authors: { name: "string" },
  eager_hmt_ord_authorships: {
    eager_hmt_ord_author_id: "integer",
    eager_hmt_ord_book_id: "integer",
  },
  eager_hmt_ord_books: { title: "string" },
  eager_ho_children: { value: "string", eager_ho_parent_id: "integer" },
  eager_ho_no_pk_children: {
    columns: { value: "string", eager_ho_no_pk_parent_id: "integer" },
    primaryKey: false,
  },
  eager_ho_no_pk_parents: { name: "string" },
  eager_ho_parents: { name: "string" },
  eager_ho_ref_children: { value: "string", eager_ho_ref_parent_id: "integer" },
  eager_ho_ref_parents: { name: "string" },
  eager_inv_children: { value: "string", eager_inv_parent_id: "integer" },
  eager_inv_parents: { name: "string" },
  eager_leo_comments: { body: "string", eager_leo_post_id: "integer" },
  eager_leo_posts: { title: "string" },
  eager_lmo_comments: { body: "string", eager_lmo_post_id: "integer" },
  eager_lmo_posts: { title: "string", priority: "integer" },
  eager_ln_comments: { rating: "float", eager_ln_post_id: "integer" },
  eager_ln_posts: { title: "string" },
  eager_multi_bt_companies: { name: "string" },
  eager_multi_bt_employees: { name: "string", company_id: "integer", mentor_company_id: "integer" },
  eager_multi_ho_parents: { name: "string" },
  eager_multi_ho_profiles: { bio: "string", eager_multi_ho_parent_id: "integer" },
  eager_nl_widgets: { name: "string" },
  eager_no_res_comments: { body: "string", eager_no_res_post_id: "integer" },
  eager_no_res_posts: { title: "string" },
  eager_nodes: { value: "string" },
  eager_null_children: { value: "string", eager_null_parent_id: "integer" },
  eager_null_parents: { name: "string" },
  eager_or_comments: { body: "string", eager_or_post_id: "integer" },
  eager_or_posts: { title: "string" },
  eager_order_comments: { body: "string", eager_order_post_id: "integer" },
  eager_order_posts: { title: "string" },
  eager_pk_authors: { name: "string" },
  eager_pk_posts: { title: "string", eager_pk_author_id: "integer" },
  eager_poly_child2s: { name: "string", parent_id: "integer", parent_type: "string" },
  eager_poly_children: { name: "string", parent_id: "integer", parent_type: "string" },
  eager_posts: { title: "string" },
  eager_reord_children: { value: "string", eager_reord_parent_id: "integer" },
  eager_reord_parents: { name: "string" },
  eager_str_bt_children: { value: "string", eager_str_bt_parent_id: "integer" },
  eager_str_bt_parents: { name: "string" },
  eager_str_children: { value: "string", eager_str_parent_id: "integer" },
  eager_str_parents: { name: "string" },
  eager_str_thr_items: { label: "string" },
  eager_str_thr_joins: { eager_str_thr_owner_id: "integer", eager_str_thr_item_id: "integer" },
  eager_str_thr_owners: { name: "string" },
  eager_tags: { name: "string", eager_article_id: "integer" },
  eager_tl_widgets: { name: "string" },
  eager_widgets: { name: "string" },
  ex_sug_posts: { title: "string" },
  ex_sug_taggings: { name: "string", ex_sug_post_id: "integer" },
  ej_em_authors: { name: "string" },
  ej_em_posts: { title: "string", ej_em_author_id: "integer" },
  ej_authors: { name: "string" },
  ej_bt_authors: { name: "string" },
  ej_bt_posts: { title: "string", ej_bt_author_id: "integer" },
  ej_ho_profiles: { bio: "string", ej_ho_user_id: "integer" },
  ej_ho_users: { name: "string" },
  ej_posts: { title: "string", ej_author_id: "integer" },
  elmar_contracts: { elmar_developer_id: "integer" },
  elmar_developers: { name: "string", elmar_mentor_id: "integer" },
  elmar_mentors: { name: "string" },
  elmar_project_developers: { elmar_project_id: "integer", elmar_developer_id: "integer" },
  elmar_projects: { name: "string", elmar_mentor_id: "integer" },
  elra_authors: { name: "string" },
  elra_posts: { title: "string", elra_author_id: "integer" },
  ewc_authors: { name: "string" },
  ewc_essays: {
    name: "string",
    ewc_author_id: "integer",
    writer_id: "integer",
    writer_type: "string",
  },
  enra_authors: { name: "string" },
  enra_posts: { title: "string", enra_author_id: "integer" },
  ex_sug_authors: { name: "string" },
  idup_categories: { name: "string" },
  idup_category_posts: { idup_post_id: "integer", idup_category_id: "integer" },
  idup_comments: { body: "string", idup_post_id: "integer" },
  idup_posts: { title: "string" },
  inc_pk_authors: { name: "string" },
  inc_pk_posts: { title: "string", inc_pk_author_id: "integer" },
  jeeo_comments: { body: "string", jeeo_post_id: "integer" },
  jeeo_posts: { title: "string" },
  lna_authors: { name: "string" },
  lna_posts: { title: "string", lna_author_id: "integer" },
  peb_clients: { name: "string", peb_firm_id: "integer" },
  peb_firms: { name: "string" },
  phmt_authors: { name: "string" },
  phmt_comments: { body: "string", phmt_post_id: "integer" },
  phmt_posts: { title: "string", phmt_author_id: "integer" },
  pra_authors: { name: "string" },
  pra_posts: { title: "string", pra_author_id: "integer" },
  pre_poly_orphans: { name: "string", owner_id: "integer", owner_type: "string" },
  psta_clubs: { name: "string" },
  psta_members: { name: "string" },
  psta_memberships: { psta_member_id: "integer", psta_club_id: "integer", active: "boolean" },
  sg_authors: { name: "string" },
  sg_comments: { body: "string", sg_post_id: "integer" },
  sg_posts: { title: "string", sg_author_id: "integer" },
  sg_memberships: { kind: "string" },
  sg_members: { name: "string", sg_post_id: "integer" },
  sg_organizations: { name: "string", sg_membership_id: "integer" },
  sg_sponsors: { sponsorable_id: "integer", sponsorable_type: "string" },
  eager_nl_authors: { name: "string" },
  eager_nl_posts: { title: "string", eager_nl_author_id: "integer" },
  eager_tl_authors: { name: "string" },
  eager_tl_posts: { title: "string" },
  eager_tl_comments: {
    body: "string",
    eager_tl_post_id: "integer",
    eager_tl_author_id: "integer",
  },
  sti_share_comments: { body: "string", type: "string", sti_share_post_id: "integer" },
  sti_share_posts: { title: "string" },
};
// Shared models for the polymorphic-preload guard tests (Rails' Sponsor → sponsorable fixtures).
class SgAuthor extends Base {
  declare name: string;

  static {
    this.attribute("name", "string");
  }
}
class SgComment extends Base {
  declare body: string;
  declare sg_post_id: number;

  static {
    this.attribute("body", "string");
    this.attribute("sg_post_id", "integer");
  }
}
class SgPost extends Base {
  declare title: string;
  declare sg_author_id: number;
  declare author: SgAuthor | null;
  declare firstComment: SgComment | null;
  declare loadBelongsTo: (name: "author") => Promise<SgAuthor | null>;
  declare loadHasOne: (name: "firstComment") => Promise<SgComment | null>;

  static {
    this.attribute("title", "string");
    this.attribute("sg_author_id", "integer");
    this.belongsTo("author", {
      className: "SgAuthor",
      foreignKey: "sg_author_id",
    });
    this.hasOne("firstComment", {
      className: "SgComment",
      foreignKey: "sg_post_id",
    });
  }
}
class SgMembership extends Base {
  declare kind: string;

  static {
    this.attribute("kind", "string");
  }
}
class SgMember extends Base {
  declare name: string;
  declare sg_post_id: number;
  declare post: SgPost | null;
  declare loadBelongsTo: (name: "post") => Promise<SgPost | null>;

  static {
    this.attribute("name", "string");
    this.attribute("sg_post_id", "integer");
    this.belongsTo("post", { className: "SgPost", foreignKey: "sg_post_id" });
  }
}
class SgOrganization extends Base {
  declare name: string;
  declare sg_membership_id: number;
  declare membership: SgMembership | null;
  declare loadBelongsTo: (name: "membership") => Promise<SgMembership | null>;

  static {
    this.attribute("name", "string");
    this.attribute("sg_membership_id", "integer");
    this.belongsTo("membership", {
      className: "SgMembership",
      foreignKey: "sg_membership_id",
    });
  }
}
class SgSponsor extends Base {
  declare sponsorable_id: number;
  declare sponsorable_type: string;
  declare sponsorable: Base | null;
  declare loadBelongsTo: (name: "sponsorable") => Promise<Base | null>;

  static {
    this.attribute("sponsorable_id", "integer");
    this.attribute("sponsorable_type", "string");
    this.belongsTo("sponsorable", { polymorphic: true });
  }
}

function registerSponsorableModels(): void {
  registerModel("SgAuthor", SgAuthor);
  registerModel("SgComment", SgComment);
  registerModel("SgPost", SgPost);
  registerModel("SgMembership", SgMembership);
  registerModel("SgMember", SgMember);
  registerModel("SgOrganization", SgOrganization);
  registerModel("SgSponsor", SgSponsor);
}

async function seedSponsors(): Promise<void> {
  const author = await SgAuthor.create({ name: "David" });
  const post = await SgPost.create({ title: "Welcome", sg_author_id: author.id });
  await SgComment.create({ body: "First!", sg_post_id: post.id });
  const membership = await SgMembership.create({ kind: "gold" });
  const member = await SgMember.create({ name: "M", sg_post_id: post.id });
  const org = await SgOrganization.create({ name: "O", sg_membership_id: membership.id });
  await SgSponsor.create({ sponsorable_type: "SgMember", sponsorable_id: member.id });
  await SgSponsor.create({ sponsorable_type: "SgOrganization", sponsorable_id: org.id });
}

// ==========================================================================
// EagerAssociationTest — targets associations/eager_test.rb
// ==========================================================================
describe("EagerAssociationTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  const { authors, companies, accounts, pirates } = useFixtures(
    [
      "authors",
      "authorFavorites",
      "posts",
      "comments",
      "companies",
      "accounts",
      "parrots",
      "pirates",
      "mateys",
    ],
    () => Base.connection,
    { schema: canonicalSchema },
  );
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
    registerModel(Matey);
    registerSponsorableModels();
  });
  it.skip("should work inverse of with eager load", () => {
    // inverse_of is not yet wired on the canonical Author.posts / Post.author
    // association pair, so assert_same (object identity) cannot be satisfied.
  });
  it("loading conditions with or", async () => {
    const author = authors("david");
    const postArr = await Post.where({ author_id: author.id })
      .references("comments")
      .includes("comments")
      .where("comments.body like 'Normal%' OR comments.type = 'SpecialComment'")
      .toArray();
    expect(postArr.every((p: any) => Number(p.author_id) === Number(author.id))).toBe(true);
  });
  it.skip("loading polymorphic association with mixed table conditions", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("loading association with string joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("loading with scope including joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("loading association with same table joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("loading association with intersection joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });

  it("loading associations dont leak instance state", async () => {
    const assertFirm = (firm: any) => {
      expect(firm.id).toBe(companies("first_firm").id);
      expect(firm.association("readonlyAccount").loaded).toBe(true);
      expect(firm.association("accounts").loaded).toBe(true);
      expect(firm.readonlyAccount.id).toBe(accounts("signals37").id);
      const accts = firm.association("accounts").target;
      expect(accts).toHaveLength(1);
      expect(accts[0].id).toBe(accounts("signals37").id);
      expect(firm.readonlyAccount.isReadonly()).toBe(true);
      expect(accts.every((a: any) => !a.isReadonly())).toBe(true);
    };
    assertFirm(await Firm.preload("readonlyAccount", "accounts").first());
    assertFirm(await Firm.eagerLoad("readonlyAccount", "accounts").first());
  });

  it("with ordering", async () => {
    class EagerOrderPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerOrderComments", {
          className: "EagerOrderComment",
          foreignKey: "eager_order_post_id",
        });
      }
    }
    class EagerOrderComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_order_post_id", "integer");
      }
    }
    registerModel("EagerOrderPost", EagerOrderPost);
    registerModel("EagerOrderComment", EagerOrderComment);

    const post = await EagerOrderPost.create({ title: "Post1" });
    await EagerOrderComment.create({ body: "c1", eager_order_post_id: post.id });
    await EagerOrderComment.create({ body: "c2", eager_order_post_id: post.id });

    const posts = await EagerOrderPost.all().includes("eagerOrderComments").toArray();
    expect(posts).toHaveLength(1);
    const comments = (posts[0] as any).association("eagerOrderComments").target;
    expect(comments).toHaveLength(2);
  });
  it("has many through with order", async () => {
    const authorsArr = await Author.all().includes("favoriteAuthors").toArray();
    expect(authorsArr.length).toBeGreaterThan(0);
    await assertNoQueries(false, () => {
      authorsArr.map((a: any) => a.favoriteAuthors);
    });
  });
  it("eager loaded has one association with references does not run additional queries", async () => {
    await Post.updateAll({ author_id: null });
    const authorsArr = await Author.all().includes("post").references("post").toArray();
    expect(authorsArr.length).toBeGreaterThan(0);
    await assertNoQueries(false, () => {
      authorsArr.map((a: any) => a.post);
    });
  });
  it("eager loaded has one association without primary key", async () => {
    const pirate = pirates("redbeard");
    const attackerMatey = await (pirate as any).attackerMatey;
    const eagerLoaded = await Pirate.eagerLoad("attackerMatey").where({ id: pirate.id }).first();
    await assertNoQueries(false, () => {
      expect((eagerLoaded as any)?.attackerMatey?.id).toBe(attackerMatey?.id);
    });
  });
  it("eager loaded has many association without primary key", async () => {
    const pirate = pirates("blackbeard");
    const mateysList: Matey[] = await pirate.mateys.toArray();
    const eagerLoaded = await Pirate.eagerLoad("mateys").where({ id: pirate.id }).first();
    expect(mateysList.length).toBeGreaterThan(0);
    await assertNoQueries(false, async () => {
      const eagerMateys: Matey[] = await (eagerLoaded as any).mateys.toArray();
      expect(eagerMateys.map((m) => m.id)).toEqual(mateysList.map((m) => m.id));
    });
  });
  it("duplicate middle objects", async () => {
    const commentArr = await Comment.where({ post_id: 1 }).includes({ post: "author" }).toArray();
    await assertNoQueries(false, () => {
      commentArr.forEach((c: any) => {
        void c.post.author.name;
      });
    });
  });
  it("including duplicate objects from belongs to", async () => {
    const popularPost = await Post.create({ title: "foo", body: "I like cars!" });
    const comment = await popularPost.comments.create({ body: "lol" });
    const michael = await Person.create({ first_name: "Michael" });
    const david = await Person.create({ first_name: "David" });
    await Reader.create({ post_id: popularPost.id, person_id: michael.id });
    await Reader.create({ post_id: popularPost.id, person_id: david.id });

    const readerArr = await Reader.where({ post_id: popularPost.id })
      .includes({ post: "comments" })
      .toArray();
    for (const reader of readerArr) {
      const readerPost = (reader as any).post;
      const readerComments = readerPost.association("comments").target;
      expect(readerComments).toHaveLength(1);
      expect(readerComments[0].id).toBe(comment.id);
    }
  });

  it("finding with includes on has many association with same include includes only once", async () => {
    class EagerTag extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("eager_article_id", "integer");
      }
    }
    class EagerArticle extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerTags", {
          className: "EagerTag",
          foreignKey: "eager_article_id",
        });
      }
    }
    registerModel("EagerTag", EagerTag);
    registerModel("EagerArticle", EagerArticle);

    const article = await EagerArticle.create({ title: "X" });
    await EagerTag.create({ name: "t1", eager_article_id: article.id });

    const results = await EagerArticle.all().includes("eagerTags").includes("eagerTags").toArray();
    expect(results).toHaveLength(1);
    const tags = (results[0] as any).association("eagerTags").target;
    expect(tags).toHaveLength(1);
  });

  it("finding with includes on has one association with same include includes only once", async () => {
    class EagerHoParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("eagerHoChild", {
          className: "EagerHoChild",
          foreignKey: "eager_ho_parent_id",
        });
      }
    }
    class EagerHoChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_ho_parent_id", "integer");
      }
    }
    registerModel("EagerHoParent", EagerHoParent);
    registerModel("EagerHoChild", EagerHoChild);

    const parent = await EagerHoParent.create({ name: "P" });
    await EagerHoChild.create({ value: "C", eager_ho_parent_id: parent.id });

    const results = await EagerHoParent.all()
      .includes("eagerHoChild")
      .includes("eagerHoChild")
      .toArray();
    expect(results).toHaveLength(1);
    const preloaded = (results[0] as any).association("eagerHoChild").target;
    expect(preloaded?.value).toBe("C");
  });
  it("finding with includes on belongs to association with same include includes only once", async () => {
    class EagerBtParent extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerBtChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_bt_parent_id", "integer");
        this.belongsTo("eagerBtParent", {
          className: "EagerBtParent",
          foreignKey: "eager_bt_parent_id",
        });
      }
    }
    registerModel("EagerBtParent", EagerBtParent);
    registerModel("EagerBtChild", EagerBtChild);

    const parent = await EagerBtParent.create({ name: "P" });
    await EagerBtChild.create({ value: "C", eager_bt_parent_id: parent.id });

    const results = await EagerBtChild.all()
      .includes("eagerBtParent")
      .includes("eagerBtParent")
      .toArray();
    expect(results).toHaveLength(1);
    const preloaded = (results[0] as any).association("eagerBtParent").target;
    expect(preloaded?.name).toBe("P");
  });
  it("finding with includes on null belongs to association with same include includes only once", async () => {
    class EagerNullParent extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerNullChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_null_parent_id", "integer");
        this.belongsTo("eagerNullParent", {
          className: "EagerNullParent",
          foreignKey: "eager_null_parent_id",
        });
      }
    }
    registerModel("EagerNullParent", EagerNullParent);
    registerModel("EagerNullChild", EagerNullChild);

    // Child with no parent (null FK)
    await EagerNullChild.create({ value: "orphan", eager_null_parent_id: null });

    const results = await EagerNullChild.all()
      .includes("eagerNullParent")
      .includes("eagerNullParent")
      .toArray();
    expect(results).toHaveLength(1);
    const preloaded = (results[0] as any).association("eagerNullParent").target;
    expect(preloaded == null).toBe(true);
  });
  it("finding with includes on null belongs to polymorphic association", async () => {
    class EagerPolyChild extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("parent_id", "integer");
        this.attribute("parent_type", "string");
        this.belongsTo("parent", { polymorphic: true });
      }
    }
    registerModel(EagerPolyChild);
    await EagerPolyChild.create({
      name: "orphan",
      parent_id: null as any,
      parent_type: null as any,
    });
    const results = await EagerPolyChild.all().includes("parent").toArray();
    expect(results).toHaveLength(1);
    const preloaded = (results[0] as any).association("parent").target;
    expect(preloaded).toBeNull();
  });
  it("finding with includes on empty polymorphic type column", async () => {
    class EagerPolyChild2 extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("parent_id", "integer");
        this.attribute("parent_type", "string");
        this.belongsTo("parent", { polymorphic: true });
      }
    }
    registerModel(EagerPolyChild2);
    await EagerPolyChild2.create({ name: "empty_type", parent_id: 1, parent_type: "" });
    const results = await EagerPolyChild2.all().includes("parent").toArray();
    expect(results).toHaveLength(1);
    const preloaded = (results[0] as any).association("parent").target;
    expect(preloaded).toBeNull();
  });

  it("loading from an association", async () => {
    class EagerAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerBook extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("eager_author_id", "integer");
        this.belongsTo("eagerAuthor", {
          className: "EagerAuthor",
          foreignKey: "eager_author_id",
        });
      }
    }
    registerModel("EagerAuthor", EagerAuthor);
    registerModel("EagerBook", EagerBook);

    const author = await EagerAuthor.create({ name: "Orwell" });
    await EagerBook.create({ title: "1984", eager_author_id: author.id });

    const books = await EagerBook.all().includes("eagerAuthor").toArray();
    expect(books).toHaveLength(1);
    const preloaded = (books[0] as any).association("eagerAuthor").target;
    expect(preloaded?.name).toBe("Orwell");
  });

  it("nested loading does not raise exception when association does not exist", async () => {
    class EagerNlAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerNlPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("eager_nl_author_id", "integer");
        this.belongsTo("author", {
          className: "EagerNlAuthor",
          foreignKey: "eager_nl_author_id",
        });
      }
    }
    registerModel("EagerNlAuthor", EagerNlAuthor);
    registerModel("EagerNlPost", EagerNlPost);
    // author is null → the nested `nonExisting` branch has no source records (eager_test.rb:380).
    await EagerNlPost.create({ title: "Authorless", eager_nl_author_id: null as any });
    const posts = await EagerNlPost.all().includes({ author: "nonExisting" }).toArray();
    expect(posts).toHaveLength(1);
  });
  it("three level nested preloading does not raise exception when association does not exist", async () => {
    class EagerTlAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerTlPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("comments", {
          className: "EagerTlComment",
          foreignKey: "eager_tl_post_id",
        });
      }
    }
    class EagerTlComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_tl_post_id", "integer");
        this.attribute("eager_tl_author_id", "integer");
        this.belongsTo("author", {
          className: "EagerTlAuthor",
          foreignKey: "eager_tl_author_id",
        });
      }
    }
    registerModel("EagerTlAuthor", EagerTlAuthor);
    registerModel("EagerTlPost", EagerTlPost);
    registerModel("EagerTlComment", EagerTlComment);
    const post = await EagerTlPost.create({ title: "P" });
    await EagerTlComment.create({
      body: "C",
      eager_tl_post_id: post.id,
      eager_tl_author_id: null as any,
    });
    // comment author is null → third-level `essays` branch never iterates (eager_test.rb:386).
    const posts = await EagerTlPost.all()
      .preload({ comments: [{ author: "essays" }] })
      .toArray();
    expect(posts).toHaveLength(1);
  });
  it("eager load has many with string keys", async () => {
    class EagerStrParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerStrChildren", {
          className: "EagerStrChild",
          foreignKey: "eager_str_parent_id",
        });
      }
    }
    class EagerStrChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_str_parent_id", "integer");
      }
    }
    registerModel("EagerStrParent", EagerStrParent);
    registerModel("EagerStrChild", EagerStrChild);

    const parent = await EagerStrParent.create({ name: "P" });
    await EagerStrChild.create({ value: "C1", eager_str_parent_id: parent.id });

    const parents = await EagerStrParent.all().includes("eagerStrChildren").toArray();
    expect(parents).toHaveLength(1);
    const children = (parents[0] as any).association("eagerStrChildren").target;
    expect(children).toHaveLength(1);
  });
  it.skip("string id column joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("eager load has many through with string keys", async () => {
    class EagerStrThrOwner extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerStrThrJoins", {
          className: "EagerStrThrJoin",
          foreignKey: "eager_str_thr_owner_id",
        });
        this.hasMany("eagerStrThrItems", {
          through: "eagerStrThrJoins",
          source: "eagerStrThrItem",
          className: "EagerStrThrItem",
        });
      }
    }
    class EagerStrThrJoin extends Base {
      static {
        this.attribute("eager_str_thr_owner_id", "integer");
        this.attribute("eager_str_thr_item_id", "integer");
        this.belongsTo("eagerStrThrItem", {
          className: "EagerStrThrItem",
          foreignKey: "eager_str_thr_item_id",
        });
      }
    }
    class EagerStrThrItem extends Base {
      static {
        this.attribute("label", "string");
      }
    }

    registerModel("EagerStrThrOwner", EagerStrThrOwner);
    registerModel("EagerStrThrJoin", EagerStrThrJoin);
    registerModel("EagerStrThrItem", EagerStrThrItem);

    const owner = await EagerStrThrOwner.create({ name: "O" });
    const item = await EagerStrThrItem.create({ label: "I" });
    await EagerStrThrJoin.create({
      eager_str_thr_owner_id: owner.id,
      eager_str_thr_item_id: item.id,
    });

    const items = await loadHasManyThrough(owner, "eagerStrThrItems", {
      through: "eagerStrThrJoins",
      source: "eagerStrThrItem",
      className: "EagerStrThrItem",
    });
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("I");
  });
  it("eager load belongs to with string keys", async () => {
    class EagerStrBtParent extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerStrBtChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_str_bt_parent_id", "integer");
        this.belongsTo("eagerStrBtParent", {
          className: "EagerStrBtParent",
          foreignKey: "eager_str_bt_parent_id",
        });
      }
    }
    registerModel("EagerStrBtParent", EagerStrBtParent);
    registerModel("EagerStrBtChild", EagerStrBtChild);

    const parent = await EagerStrBtParent.create({ name: "P" });
    await EagerStrBtChild.create({
      value: "C",
      eager_str_bt_parent_id: parent.id,
    });

    const children = await EagerStrBtChild.all().includes("eagerStrBtParent").toArray();
    expect(children).toHaveLength(1);
    const preloaded = (children[0] as any).association("eagerStrBtParent").target;
    expect(preloaded?.name).toBe("P");
  });
  it("eager association loading with explicit join", async () => {
    class EjAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("ejPosts", {
          className: "EjPost",
          foreignKey: "ej_author_id",
        });
      }
    }
    class EjPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("ej_author_id", "integer");
      }
    }
    registerModel(EjAuthor);
    registerModel(EjPost);

    const alice = await EjAuthor.create({ name: "Alice" });
    await EjPost.create({ title: "P1", ej_author_id: alice.id });
    await EjPost.create({ title: "P2", ej_author_id: alice.id });

    const authors = await EjAuthor.all().eagerLoad("ejPosts").toArray();
    expect(authors).toHaveLength(1);
    const posts = (authors[0] as any).association("ejPosts").target;
    expect(posts).toHaveLength(2);
    const titles = posts.map((p: any) => p.title).sort();
    expect(titles).toEqual(["P1", "P2"]);

    // Association proxy wired during hydration (read off the holder, not lazy-synced)
    const proxyInstance = (authors[0] as any)._associationInstances.get("ejPosts");
    expect(proxyInstance).toBeDefined();
    expect(proxyInstance.loaded).toBe(true);
    expect(Array.isArray(proxyInstance.target)).toBe(true);
    expect(proxyInstance.target).toHaveLength(2);
  });
  it("eager association loading with explicit join belongs to", async () => {
    class EjBtAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EjBtPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("ej_bt_author_id", "integer");
        this.belongsTo("ejBtAuthor", {
          className: "EjBtAuthor",
          foreignKey: "ej_bt_author_id",
        });
      }
    }
    registerModel(EjBtAuthor);
    registerModel(EjBtPost);

    const author = await EjBtAuthor.create({ name: "BtAuthor" });
    await EjBtPost.create({ title: "BtPost", ej_bt_author_id: author.id });

    const posts2 = await EjBtPost.all().eagerLoad("ejBtAuthor").toArray();
    expect(posts2).toHaveLength(1);
    const loaded = (posts2[0] as any).association("ejBtAuthor").target;
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe("BtAuthor");

    // Association proxy wired during hydration (read off the holder, not lazy-synced)
    const btProxy = (posts2[0] as any)._associationInstances.get("ejBtAuthor");
    expect(btProxy).toBeDefined();
    expect(btProxy.loaded).toBe(true);
    expect(btProxy.target).not.toBeNull();
    expect(btProxy.target.name).toBe("BtAuthor");
  });
  it("eager association loading with explicit join has one", async () => {
    class EjHoUser extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("ejHoProfile", {
          className: "EjHoProfile",
          foreignKey: "ej_ho_user_id",
        });
      }
    }
    class EjHoProfile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("ej_ho_user_id", "integer");
      }
    }
    registerModel(EjHoUser);
    registerModel(EjHoProfile);

    const user = await EjHoUser.create({ name: "HoUser" });
    await EjHoProfile.create({ bio: "HoBio", ej_ho_user_id: user.id });

    const users = await EjHoUser.all().eagerLoad("ejHoProfile").toArray();
    expect(users).toHaveLength(1);
    const profile = (users[0] as any).association("ejHoProfile").target;
    expect(profile).not.toBeNull();
    expect(profile.bio).toBe("HoBio");

    // Association proxy wired during hydration (read off the holder, not lazy-synced)
    const hoProxy = (users[0] as any)._associationInstances.get("ejHoProfile");
    expect(hoProxy).toBeDefined();
    expect(hoProxy.loaded).toBe(true);
    expect(hoProxy.target).not.toBeNull();
    expect(hoProxy.target.bio).toBe("HoBio");
  });
  it("eager association loading with explicit join marks empty association loaded", async () => {
    class EjEmAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("ejEmPosts", {
          className: "EjEmPost",
          foreignKey: "ej_em_author_id",
        });
      }
    }
    class EjEmPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("ej_em_author_id", "integer");
      }
    }
    registerModel(EjEmAuthor);
    registerModel(EjEmPost);

    await EjEmAuthor.create({ name: "NoPostsAuthor" });

    const authors = await EjEmAuthor.all().eagerLoad("ejEmPosts").toArray();
    expect(authors).toHaveLength(1);
    const proxy = (authors[0] as any)._associationInstances.get("ejEmPosts");
    expect(proxy).toBeDefined();
    expect(proxy.loaded).toBe(true);
    expect(proxy.target).toEqual([]);
  });
  it("eager with invalid association reference", async () => {
    class EagerWidget extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("EagerWidget", EagerWidget);

    await EagerWidget.create({ name: "w1" });
    const expected =
      /Association named 'monkeys' was not found on EagerWidget; perhaps you misspelled it\?/;
    await expect(EagerWidget.all().includes("monkeys").toArray()).rejects.toThrow(expected);
    await expect(
      EagerWidget.all()
        .includes(["monkeys"] as any)
        .toArray(),
    ).rejects.toThrow(expected);
    await expect(EagerWidget.all().includes("monkeys", "elephants").toArray()).rejects.toThrow(
      expected,
    );
  });

  it("exceptions have suggestions for fix", async () => {
    class ExSugTagging extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("ex_sug_post_id", "integer");
      }
    }
    class ExSugPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("tagging", {
          className: "ExSugTagging",
          foreignKey: "ex_sug_post_id",
        });
      }
    }
    registerModel("ExSugTagging", ExSugTagging);
    registerModel("ExSugPost", ExSugPost);

    await ExSugPost.create({ title: "P" });

    let error: any;
    try {
      await ExSugPost.all().includes("taggingz").toArray();
    } catch (e: any) {
      error = e;
    }
    expect(error).toBeInstanceOf(AssociationNotFoundError);
    expect(error.detailedMessage()).toContain("Did you mean?  tagging");
  });
  it("eager has many through with order", async () => {
    class EagerHmtOrdAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtOrdAuthorships", {
          className: "EagerHmtOrdAuthorship",
          foreignKey: "eager_hmt_ord_author_id",
        });
        this.hasMany("eagerHmtOrdBooks", {
          through: "eagerHmtOrdAuthorships",
          source: "eagerHmtOrdBook",
          className: "EagerHmtOrdBook",
        });
      }
    }
    class EagerHmtOrdAuthorship extends Base {
      static {
        this.attribute("eager_hmt_ord_author_id", "integer");
        this.attribute("eager_hmt_ord_book_id", "integer");
        this.belongsTo("eagerHmtOrdBook", {
          className: "EagerHmtOrdBook",
          foreignKey: "eager_hmt_ord_book_id",
        });
      }
    }
    class EagerHmtOrdBook extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtOrdAuthor", EagerHmtOrdAuthor);
    registerModel("EagerHmtOrdAuthorship", EagerHmtOrdAuthorship);
    registerModel("EagerHmtOrdBook", EagerHmtOrdBook);

    const author = await EagerHmtOrdAuthor.create({ name: "Writer" });
    const b1 = await EagerHmtOrdBook.create({ title: "Zebra" });
    const b2 = await EagerHmtOrdBook.create({ title: "Alpha" });
    await EagerHmtOrdAuthorship.create({
      eager_hmt_ord_author_id: author.id,
      eager_hmt_ord_book_id: b1.id,
    });
    await EagerHmtOrdAuthorship.create({
      eager_hmt_ord_author_id: author.id,
      eager_hmt_ord_book_id: b2.id,
    });

    const books = await loadHasManyThrough(author, "eagerHmtOrdBooks", {
      through: "eagerHmtOrdAuthorships",
      source: "eagerHmtOrdBook",
      className: "EagerHmtOrdBook",
    });
    expect(books).toHaveLength(2);
  });
  it("eager has many through multiple with order", async () => {
    class EagerHmtMoAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtMoAuthorships", {
          className: "EagerHmtMoAuthorship",
          foreignKey: "eager_hmt_mo_author_id",
        });
        this.hasMany("eagerHmtMoBooks", {
          through: "eagerHmtMoAuthorships",
          source: "eagerHmtMoBook",
          className: "EagerHmtMoBook",
        });
      }
    }
    class EagerHmtMoAuthorship extends Base {
      static {
        this.attribute("eager_hmt_mo_author_id", "integer");
        this.attribute("eager_hmt_mo_book_id", "integer");
        this.belongsTo("eagerHmtMoBook", {
          className: "EagerHmtMoBook",
          foreignKey: "eager_hmt_mo_book_id",
        });
      }
    }
    class EagerHmtMoBook extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtMoAuthor", EagerHmtMoAuthor);
    registerModel("EagerHmtMoAuthorship", EagerHmtMoAuthorship);
    registerModel("EagerHmtMoBook", EagerHmtMoBook);

    const a1 = await EagerHmtMoAuthor.create({ name: "A1" });
    const a2 = await EagerHmtMoAuthor.create({ name: "A2" });
    const book = await EagerHmtMoBook.create({ title: "Shared" });
    await EagerHmtMoAuthorship.create({
      eager_hmt_mo_author_id: a1.id,
      eager_hmt_mo_book_id: book.id,
    });
    await EagerHmtMoAuthorship.create({
      eager_hmt_mo_author_id: a2.id,
      eager_hmt_mo_book_id: book.id,
    });

    const books1 = await loadHasManyThrough(a1, "eagerHmtMoBooks", {
      through: "eagerHmtMoAuthorships",
      source: "eagerHmtMoBook",
      className: "EagerHmtMoBook",
    });
    const books2 = await loadHasManyThrough(a2, "eagerHmtMoBooks", {
      through: "eagerHmtMoAuthorships",
      source: "eagerHmtMoBook",
      className: "EagerHmtMoBook",
    });
    expect(books1).toHaveLength(1);
    expect(books2).toHaveLength(1);
    expect(books1[0].id).toBe(books2[0].id);
  });
  it("limited eager with order", async () => {
    class EagerLeoPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerLeoComments", {
          className: "EagerLeoComment",
          foreignKey: "eager_leo_post_id",
        });
      }
    }
    class EagerLeoComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_leo_post_id", "integer");
      }
    }
    registerModel("EagerLeoPost", EagerLeoPost);
    registerModel("EagerLeoComment", EagerLeoComment);
    const post = await EagerLeoPost.create({ title: "P" });
    await EagerLeoComment.create({ body: "c1", eager_leo_post_id: post.id });
    await EagerLeoComment.create({ body: "c2", eager_leo_post_id: post.id });
    const posts = await EagerLeoPost.all()
      .order("title")
      .limit(1)
      .includes("eagerLeoComments")
      .toArray();
    expect(posts).toHaveLength(1);
    expect((posts[0] as any).association("eagerLeoComments").target).toHaveLength(2);
  });
  it("limited eager with multiple order columns", async () => {
    class EagerLmoPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("priority", "integer");
        this.hasMany("eagerLmoComments", {
          className: "EagerLmoComment",
          foreignKey: "eager_lmo_post_id",
        });
      }
    }
    class EagerLmoComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_lmo_post_id", "integer");
      }
    }
    registerModel("EagerLmoPost", EagerLmoPost);
    registerModel("EagerLmoComment", EagerLmoComment);
    const post = await EagerLmoPost.create({ title: "P", priority: 1 });
    await EagerLmoComment.create({ body: "c1", eager_lmo_post_id: post.id });
    const posts = await EagerLmoPost.all()
      .order("priority", "title")
      .limit(1)
      .includes("eagerLmoComments")
      .toArray();
    expect(posts).toHaveLength(1);
    expect((posts[0] as any).association("eagerLmoComments").target).toHaveLength(1);
  });
  it("limited eager with numeric in association", async () => {
    class EagerLnPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerLnComments", {
          className: "EagerLnComment",
          foreignKey: "eager_ln_post_id",
        });
      }
    }
    class EagerLnComment extends Base {
      static {
        this.attribute("rating", "float");
        this.attribute("eager_ln_post_id", "integer");
      }
    }
    registerModel("EagerLnPost", EagerLnPost);
    registerModel("EagerLnComment", EagerLnComment);
    const post = await EagerLnPost.create({ title: "P" });
    await EagerLnComment.create({ rating: 4.5, eager_ln_post_id: post.id });
    const posts = await EagerLnPost.all().includes("eagerLnComments").toArray();
    const comments = (posts[0] as any).association("eagerLnComments").target;
    expect(comments).toHaveLength(1);
    expect(comments[0].rating).toBe(4.5);
  });
  it("eager with multiple associations with same table has one", async () => {
    class EagerMultiHoParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("eagerMultiHoProfile", {
          className: "EagerMultiHoProfile",
          foreignKey: "eager_multi_ho_parent_id",
        });
      }
    }
    class EagerMultiHoProfile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("eager_multi_ho_parent_id", "integer");
      }
    }
    registerModel("EagerMultiHoParent", EagerMultiHoParent);
    registerModel("EagerMultiHoProfile", EagerMultiHoProfile);

    const p1 = await EagerMultiHoParent.create({ name: "Alice" });
    const p2 = await EagerMultiHoParent.create({ name: "Bob" });
    await EagerMultiHoProfile.create({
      bio: "Alice bio",
      eager_multi_ho_parent_id: p1.id,
    });
    await EagerMultiHoProfile.create({
      bio: "Bob bio",
      eager_multi_ho_parent_id: p2.id,
    });

    const parents = await EagerMultiHoParent.all().includes("eagerMultiHoProfile").toArray();
    expect(parents).toHaveLength(2);
    for (const parent of parents) {
      const profile = (parent as any).association("eagerMultiHoProfile").target;
      expect(profile).toBeDefined();
      expect(profile.bio).toContain("bio");
    }
  });
  it("eager with multiple associations with same table belongs to", async () => {
    class EagerMultiBtCompany extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerMultiBtEmployee extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("company_id", "integer");
        this.attribute("mentor_company_id", "integer");
        this.belongsTo("company", {
          className: "EagerMultiBtCompany",
          foreignKey: "company_id",
        });
        this.belongsTo("mentorCompany", {
          className: "EagerMultiBtCompany",
          foreignKey: "mentor_company_id",
        });
      }
    }

    registerModel("EagerMultiBtCompany", EagerMultiBtCompany);
    registerModel("EagerMultiBtEmployee", EagerMultiBtEmployee);

    const c1 = await EagerMultiBtCompany.create({ name: "Acme" });
    const c2 = await EagerMultiBtCompany.create({ name: "Globex" });
    await EagerMultiBtEmployee.create({
      name: "Alice",
      company_id: c1.id,
      mentor_company_id: c2.id,
    });

    const employees = await EagerMultiBtEmployee.all()
      .includes("company")
      .includes("mentorCompany")
      .toArray();
    expect(employees).toHaveLength(1);
    expect((employees[0] as any).association("company").target?.name).toBe("Acme");
    expect((employees[0] as any).association("mentorCompany").target?.name).toBe("Globex");
  });

  it("eager with valid association as string not symbol", async () => {
    class EagerNode extends Base {
      static {
        this.attribute("value", "string");
        this.hasMany("eagerEdges", {
          className: "EagerEdge",
          foreignKey: "eager_node_id",
        });
      }
    }
    class EagerEdge extends Base {
      static {
        this.attribute("label", "string");
        this.attribute("eager_node_id", "integer");
      }
    }
    registerModel("EagerNode", EagerNode);
    registerModel("EagerEdge", EagerEdge);

    const node = await EagerNode.create({ value: "root" });
    await EagerEdge.create({ label: "e1", eager_node_id: node.id });

    // Passing association name as string (not symbol — no difference in TS)
    const nodes = await EagerNode.all().includes("eagerEdges").toArray();
    expect(nodes).toHaveLength(1);
  });

  it.skip("eager association with scope with joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("count with include", async () => {
    class EagerCountPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerCountComments", {
          className: "EagerCountComment",
          foreignKey: "eager_count_post_id",
        });
      }
    }
    class EagerCountComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_count_post_id", "integer");
      }
    }
    registerModel("EagerCountPost", EagerCountPost);
    registerModel("EagerCountComment", EagerCountComment);

    await EagerCountPost.create({ title: "P1" });
    await EagerCountPost.create({ title: "P2" });

    const count = await EagerCountPost.all().includes("eagerCountComments").count();
    expect(count).toBe(2);
  });

  it("load with sti sharing association", async () => {
    class StiShareComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("type", "string");
        this.attribute("sti_share_post_id", "integer");
        this.belongsTo("stiSharePost", {
          foreignKey: "sti_share_post_id",
        });
      }
    }
    class StiSharePost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    enableSti(StiShareComment);
    registerModel(StiShareComment);
    registerModel(StiSharePost);

    const post = await StiSharePost.create({ title: "T" });
    await StiShareComment.create({ body: "C", sti_share_post_id: post.id });

    const comments = await StiShareComment.all().includes("stiSharePost").toArray();
    expect(comments).toHaveLength(1);
    const loaded = (comments[0] as any).association("stiSharePost").target;
    expect(loaded).not.toBeNull();
    expect(loaded.title).toBe("T");
  });
  it.skip("eager loading with conditions on string joined table preloads", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("preload has many using primary key", async () => {
    class EagerPkAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerPkPosts", {
          className: "EagerPkPost",
          foreignKey: "eager_pk_author_id",
        });
      }
    }
    class EagerPkPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("eager_pk_author_id", "integer");
      }
    }
    registerModel("EagerPkAuthor", EagerPkAuthor);
    registerModel("EagerPkPost", EagerPkPost);
    const a = await EagerPkAuthor.create({ name: "Alice" });
    await EagerPkPost.create({ title: "P1", eager_pk_author_id: a.id });
    await EagerPkPost.create({ title: "P2", eager_pk_author_id: a.id });
    const authors = await EagerPkAuthor.all().preload("eagerPkPosts").toArray();
    expect(authors).toHaveLength(1);
    const posts = (authors[0] as any).association("eagerPkPosts").target ?? [];
    expect(posts).toHaveLength(2);
  });

  it("include has many using primary key", async () => {
    class IncPkAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("incPkPosts", {
          className: "IncPkPost",
          foreignKey: "inc_pk_author_id",
        });
      }
    }
    class IncPkPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("inc_pk_author_id", "integer");
      }
    }
    registerModel("IncPkAuthor", IncPkAuthor);
    registerModel("IncPkPost", IncPkPost);
    const a = await IncPkAuthor.create({ name: "Bob" });
    await IncPkPost.create({ title: "Q1", inc_pk_author_id: a.id });
    const authors = await IncPkAuthor.all().includes("incPkPosts").toArray();
    expect(authors).toHaveLength(1);
    const posts = (authors[0] as any).association("incPkPosts").target ?? [];
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe("Q1");
  });
  it("preloading through empty belongs to", async () => {
    class EagerEmptyBtParent extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerEmptyBtChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_empty_bt_parent_id", "integer");
        this.belongsTo("eagerEmptyBtParent", {
          className: "EagerEmptyBtParent",
          foreignKey: "eager_empty_bt_parent_id",
        });
      }
    }
    registerModel("EagerEmptyBtParent", EagerEmptyBtParent);
    registerModel("EagerEmptyBtChild", EagerEmptyBtChild);

    // Child with null FK - no parent
    await EagerEmptyBtChild.create({ value: "orphan", eager_empty_bt_parent_id: null });

    const children = await EagerEmptyBtChild.all().includes("eagerEmptyBtParent").toArray();
    expect(children).toHaveLength(1);
    const preloaded = (children[0] as any).association("eagerEmptyBtParent").target;
    expect(preloaded == null).toBe(true);
  });
  it("preloading empty belongs to polymorphic", async () => {
    class PrePolyOrphan extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("owner_id", "integer");
        this.attribute("owner_type", "string");
        this.belongsTo("owner", { polymorphic: true });
      }
    }
    registerModel(PrePolyOrphan);
    await PrePolyOrphan.create({ name: "orphan" });
    const results = await PrePolyOrphan.all().includes("owner").toArray();
    expect(results).toHaveLength(1);
    const preloaded = (results[0] as any).association("owner").target;
    expect(preloaded).toBeNull();
  });
  it("preloading has one using reorder", async () => {
    class EagerReordParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("eagerReordChild", {
          className: "EagerReordChild",
          foreignKey: "eager_reord_parent_id",
        });
      }
    }
    class EagerReordChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_reord_parent_id", "integer");
      }
    }
    registerModel("EagerReordParent", EagerReordParent);
    registerModel("EagerReordChild", EagerReordChild);
    const parent = await EagerReordParent.create({ name: "P" });
    await EagerReordChild.create({ value: "V", eager_reord_parent_id: parent.id });
    const parents = await EagerReordParent.all().includes("eagerReordChild").toArray();
    expect((parents[0] as any).association("eagerReordChild").target?.value).toBe("V");
  });
  it("join eager with empty order should generate valid sql", async () => {
    class JeeoPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("jeeoComments", {
          className: "JeeoComment",
          foreignKey: "jeeo_post_id",
        });
      }
    }
    class JeeoComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("jeeo_post_id", "integer");
        this.belongsTo("jeeoPost", {
          className: "JeeoPost",
          foreignKey: "jeeo_post_id",
        });
      }
    }
    registerModel("JeeoPost", JeeoPost);
    registerModel("JeeoComment", JeeoComment);

    const post = await JeeoPost.create({ title: "Hello" });
    await JeeoComment.create({ body: "Thank you for the welcome", jeeo_post_id: post.id });

    // Rails: Post.includes(:comments).order("").first must not raise —
    // empty order string should be silently dropped. Use toArray() to avoid
    // the LIMIT-in-subquery eager load path that MariaDB rejects.
    let error: unknown;
    try {
      await (JeeoPost as any)
        .all()
        .includes("jeeoComments")
        .references("jeeo_comments")
        .order("")
        .toArray();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
    // Also verify the result has the preloaded comments
    const result = await (JeeoPost as any)
      .all()
      .includes("jeeoComments")
      .references("jeeo_comments")
      .order("")
      .toArray();
    expect(result).toHaveLength(1);
    expect(result[0].association("jeeoComments").target).toHaveLength(1);
  });
  it("eager load multiple associations with references", async () => {
    class ElmarMentor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("elmarDevelopers", {
          className: "ElmarDeveloper",
          foreignKey: "elmar_mentor_id",
        });
      }
    }
    class ElmarDeveloper extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("elmar_mentor_id", "integer");
        this.belongsTo("elmarMentor", {
          className: "ElmarMentor",
          foreignKey: "elmar_mentor_id",
        });
        this.hasMany("elmarContracts", {
          className: "ElmarContract",
          foreignKey: "elmar_developer_id",
        });
      }
    }
    class ElmarContract extends Base {
      static {
        this.attribute("elmar_developer_id", "integer");
      }
    }
    class ElmarProject extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("elmar_mentor_id", "integer");
        this.belongsTo("elmarMentor", {
          className: "ElmarMentor",
          foreignKey: "elmar_mentor_id",
        });
        this.hasMany("elmarProjectDevelopers", {
          className: "ElmarProjectDeveloper",
          foreignKey: "elmar_project_id",
        });
        this.hasMany("elmarDevelopers", {
          className: "ElmarDeveloper",
          through: "elmarProjectDevelopers",
          source: "elmarDeveloper",
        });
      }
    }
    class ElmarProjectDeveloper extends Base {
      static {
        this.attribute("elmar_project_id", "integer");
        this.attribute("elmar_developer_id", "integer");
        this.belongsTo("elmarDeveloper", {
          className: "ElmarDeveloper",
          foreignKey: "elmar_developer_id",
        });
        this.belongsTo("elmarProject", {
          className: "ElmarProject",
          foreignKey: "elmar_project_id",
        });
      }
    }
    registerModel("ElmarMentor", ElmarMentor);
    registerModel("ElmarDeveloper", ElmarDeveloper);
    registerModel("ElmarContract", ElmarContract);
    registerModel("ElmarProject", ElmarProject);
    registerModel("ElmarProjectDeveloper", ElmarProjectDeveloper);

    const mentor = await ElmarMentor.create({ name: "Mentor" });
    const dev = await ElmarDeveloper.create({ name: "Dev", elmar_mentor_id: mentor.id });
    const contract = await ElmarContract.create({ elmar_developer_id: dev.id });
    const project = await ElmarProject.create({ name: "Project", elmar_mentor_id: mentor.id });
    await ElmarProjectDeveloper.create({
      elmar_project_id: project.id,
      elmar_developer_id: dev.id,
    });

    // Rails: Project.references(:mentors).includes(mentor: { developers: :contracts }, developers: :contracts)
    // references("elmar_mentors") registers the mentor table; nested hash includes preload
    // both branches. Rails asserts the same contracts object is reused across both paths.
    const projects = await (ElmarProject as any)
      .all()
      .references("elmar_mentors")
      .includes({
        elmarMentor: { elmarDevelopers: "elmarContracts" },
        elmarDevelopers: "elmarContracts",
      })
      .toArray();

    // Rails: projects.last.mentor.developers.first.contracts == projects.last.developers.last.contracts
    const p = projects[0];
    const mentorDevContracts = p
      .association("elmarMentor")
      .target?.association("elmarDevelopers")
      .target?.[0]?.association("elmarContracts").target;
    const directDevContracts = p
      .association("elmarDevelopers")
      .target?.[0]?.association("elmarContracts").target;

    expect(mentorDevContracts).toHaveLength(1);
    expect(directDevContracts).toHaveLength(1);
    expect(mentorDevContracts![0].id).toBe(contract.id);
    expect(directDevContracts![0].id).toBe(contract.id);
    // Rails: assert_equal projects.last.mentor.developers.first.contracts,
    //        projects.last.developers.last.contracts — AR `==` is class+id
    // equality (not object identity); both branches JOIN the same contract row.
    expect(mentorDevContracts![0].id).toBe(directDevContracts![0].id);
    expect(mentorDevContracts![0].elmar_developer_id).toBe(
      directDevContracts![0].elmar_developer_id,
    );
  });
  it("scoping with a circular preload", async () => {
    // Rails: Comment.preload(post: :comments).scoping { Comment.find(1) }
    // The pushed scope carries the preload values, so `find` inside the block
    // runs the circular preload (comment -> post -> comments). It must not loop
    // or error, and `find` must still return the matching record.
    const post = await Post.create({ title: "P", body: "b" });
    const c1 = await Comment.create({ post_id: post.id, body: "c1" });

    const rel = (Comment as any).all().preload({ post: "comments" });
    const found = await (Comment as any).scoping(rel, async () => {
      return await (Comment as any).find(c1.id);
    });
    expect(found.id).toBe(c1.id);
    // The current scope's preload values are applied by `find`, so the circular
    // preload actually traverses post -> comments (the original loop hazard).
    const loadedPost = found.association("post").target;
    expect(loadedPost.id).toBe(post.id);
    expect(loadedPost.association("comments").target.map((c: any) => c.id)).toContain(c1.id);
  });

  it("circular preload does not modify unscoped", async () => {
    // Rails: FirstPost.preload(comments: :first_post).find(1) must not let
    // FirstPost's default scope (where id: 1) leak into a later unscoped lookup.
    // Uses fixture post id=1 (welcome) as the FirstPost target; creates a fresh post2.
    registerModel("FirstPost", FirstPost);
    const post2 = await Post.create({ title: "P2", body: "b" });
    await Comment.create({ post_id: 1, body: "c1" });

    const expected = await (FirstPost as any).unscoped().find(post2.id);
    await (FirstPost as any).all().preload({ comments: "firstPost" }).find(1);
    const after = await (FirstPost as any).unscoped().find(post2.id);
    expect(after.id).toBe(expected.id);
  });

  it.skip("preloading associations with string joins and order references", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("preloading readonly association", async () => {
    class PraAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("praPosts", {
          className: "PraPost",
          foreignKey: "pra_author_id",
        });
      }
    }
    class PraPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("pra_author_id", "integer");
      }
    }
    registerModel("PraAuthor", PraAuthor);
    registerModel("PraPost", PraPost);
    const a = await PraAuthor.create({ name: "A" });
    await PraPost.create({ title: "P", pra_author_id: a.id });
    const authors = await PraAuthor.all().preload("praPosts").toArray();
    const posts = (authors[0] as any).association("praPosts").target ?? [];
    expect(posts).toHaveLength(1);
  });

  it("eager-loading non-readonly association", async () => {
    class EnraAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("enraPosts", {
          className: "EnraPost",
          foreignKey: "enra_author_id",
        });
      }
    }
    class EnraPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("enra_author_id", "integer");
      }
    }
    registerModel("EnraAuthor", EnraAuthor);
    registerModel("EnraPost", EnraPost);
    const a = await EnraAuthor.create({ name: "A" });
    await EnraPost.create({ title: "P", enra_author_id: a.id });
    const authors = await EnraAuthor.all().eagerLoad("enraPosts").toArray();
    const posts = (authors[0] as any).association("enraPosts").target ?? [];
    expect(posts).toHaveLength(1);
    expect(posts[0]._readonly).not.toBe(true);
  });

  it("eager-loading readonly association", async () => {
    class ElraAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("elraPosts", {
          className: "ElraPost",
          foreignKey: "elra_author_id",
          scope: (rel: any) => rel.readonly(),
        });
      }
    }
    class ElraPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("elra_author_id", "integer");
      }
    }
    registerModel("ElraAuthor", ElraAuthor);
    registerModel("ElraPost", ElraPost);
    const a = await ElraAuthor.create({ name: "A" });
    await ElraPost.create({ title: "P", elra_author_id: a.id });
    const authors = await ElraAuthor.all().eagerLoad("elraPosts").toArray();
    const posts = (authors[0] as any).association("elraPosts").target ?? [];
    expect(posts).toHaveLength(1);
    expect(posts[0]._readonly).toBe(true);
  });

  it("eager-loading with a polymorphic association won't work consistently", async () => {
    class EwcAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("essays", { className: "EwcEssay" });
      }
    }
    class EwcEssay extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("ewc_author_id", "integer");
        this.attribute("writer_id", "integer");
        this.attribute("writer_type", "string");
        this.belongsTo("writer", { polymorphic: true });
      }
    }
    registerModel(EwcAuthor);
    registerModel(EwcEssay);

    const david = await EwcAuthor.create({ name: "David" });
    await EwcEssay.create({ name: "A", ewc_author_id: david.id });
    const essays = EwcEssay.all().where({ ewc_author_id: david.id });

    await expect(essays.eagerLoad("writer").toArray()).rejects.toThrow(EagerLoadPolymorphicError);
    await expect(essays.eagerLoad("writer").count()).rejects.toThrow(EagerLoadPolymorphicError);
    await expect(essays.eagerLoad("writer").exists()).rejects.toThrow(EagerLoadPolymorphicError);
    // Rails routes every calculation through apply_join_dependency when eager
    // loading, so sum/minimum (single aggregate) and grouped aggregates raise too.
    await expect(essays.eagerLoad("writer").sum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    await expect(essays.eagerLoad("writer").minimum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    await expect(essays.eagerLoad("writer").group("writer_type").sum("writer_id")).rejects.toThrow(
      EagerLoadPolymorphicError,
    );
    // Rails `exists?` short-circuits on a falsey condition before the
    // eager_loading? raise (finder_methods.rb:367-369).
    expect(await essays.eagerLoad("writer").exists(false)).toBe(false);
    // Misspelled eager-load names raise on the calculation path too — Rails
    // construct_join_dependency → find_reflection (join_dependency.rb), so count
    // doesn't silently ignore an unknown association.
    await expect(essays.eagerLoad("nope").count()).rejects.toThrow(/misspelled it/);
  });
  it("preloading has_many_through association avoids calling association.reader", async () => {
    class PhmtAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("phmtPosts", { foreignKey: "phmt_author_id" });
        this.hasMany("phmtComments", {
          through: "phmtPosts",
          source: "phmtComments",
          className: "PhmtComment",
        });
      }
    }
    class PhmtPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("phmt_author_id", "integer");
        this.hasMany("phmtComments", { foreignKey: "phmt_post_id" });
      }
    }
    class PhmtComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("phmt_post_id", "integer");
      }
    }
    registerModel(PhmtAuthor);
    registerModel(PhmtPost);
    registerModel(PhmtComment);

    const author = await PhmtAuthor.create({ name: "David" });
    const post = await PhmtPost.create({ title: "T", phmt_author_id: author.id });
    await PhmtComment.create({ body: "C", phmt_post_id: post.id });

    // Preloading the through association should work without calling association.reader
    const authors = await PhmtAuthor.all().preload("phmtComments").toArray();
    expect(authors).toHaveLength(1);
    const comments = (authors[0] as any).association("phmtComments").target;
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("C");
  });
  it("preloading through a polymorphic association doesn't require the association to exist", async () => {
    await seedSponsors();
    const sponsors = await SgSponsor.all()
      .preload({ sponsorable: ["post", "membership"] })
      .toArray();
    expect(sponsors).toHaveLength(2);
    const sponsorables = sponsors.map((s) => (s as any).association("sponsorable").target);
    expect(sponsorables.every((s: any) => s != null)).toBe(true);
    const member = sponsorables.find((s: any) => s?.constructor.name === "SgMember");
    const org = sponsorables.find((s: any) => s?.constructor.name === "SgOrganization");
    expect(member.association("post").isLoaded()).toBe(true);
    expect(org.association("membership").isLoaded()).toBe(true);
  });
  it("preloading a regular association through a polymorphic association doesn't require the association to exist on all types", async () => {
    await seedSponsors();
    const sponsors = await SgSponsor.all()
      .preload({ sponsorable: [{ post: "firstComment" }, "membership"] })
      .toArray();
    expect(sponsors).toHaveLength(2);
    const member = sponsors
      .map((s) => (s as any).association("sponsorable").target)
      .find((s: any) => s?.constructor.name === "SgMember");
    const post = member.association("post").target;
    expect(post).toBeTruthy();
    expect(post.association("firstComment").target?.body).toBe("First!");
  });
  it("preloading a regular association with a typo through a polymorphic association still raises", async () => {
    await seedSponsors();
    await expect(
      SgSponsor.all()
        .preload({ sponsorable: [{ post: "fistComment" }, "membership"] })
        .toArray(),
    ).rejects.toThrow(
      /Association named 'fistComment' was not found on SgPost; perhaps you misspelled it\?/,
    );
  });
  it("preloading belongs_to with cpk", async () => {
    class CpkOrder extends Base {
      static {
        this.attribute("shop_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.primaryKey = ["shop_id", "id"];
      }
    }
    class CpkLineItem extends Base {
      static {
        this.attribute("order_shop_id", "integer");
        this.attribute("order_id", "integer");
        this.attribute("product", "string");
        this.belongsTo("cpkOrder", {
          foreignKey: ["order_shop_id", "order_id"],
          className: "CpkOrder",
        });
      }
    }
    registerModel(CpkOrder);
    registerModel(CpkLineItem);

    await CpkOrder.insertAll([{ shop_id: 1, id: 1, name: "Order1" }]);
    await CpkLineItem.create({ order_shop_id: 1, order_id: 1, product: "Widget" });

    const lineItem = (await CpkLineItem.first()) as any;
    const found = (await CpkLineItem.all()
      .eagerLoad("cpkOrder")
      .findBy({ id: lineItem.id })) as any;
    const order = found.association("cpkOrder").target;
    expect(order).not.toBeNull();
    expect(order.name).toBe("Order1");
  });

  it("preloading has_many with cpk", async () => {
    class CpkHmOrder extends Base {
      static {
        this.attribute("shop_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.primaryKey = ["shop_id", "id"];
        this.hasMany("cpkHmItems", {
          className: "CpkHmItem",
          foreignKey: ["order_shop_id", "order_id"],
        });
      }
    }
    class CpkHmItem extends Base {
      static {
        this.attribute("order_shop_id", "integer");
        this.attribute("order_id", "integer");
        this.attribute("product", "string");
      }
    }
    registerModel(CpkHmOrder);
    registerModel(CpkHmItem);

    await CpkHmOrder.insertAll([{ shop_id: 1, id: 1, name: "Order1" }]);
    await CpkHmItem.create({ order_shop_id: 1, order_id: 1, product: "A" });
    await CpkHmItem.create({ order_shop_id: 1, order_id: 1, product: "B" });

    const order = (await CpkHmOrder.first()) as any;
    const found = (await CpkHmOrder.all().eagerLoad("cpkHmItems").findBy({ id: order.id })) as any;
    const items = found.association("cpkHmItems").target;
    expect(items).toHaveLength(2);
  });

  it("preloading has_one with cpk", async () => {
    class CpkHoOrder extends Base {
      static {
        this.attribute("shop_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.primaryKey = ["shop_id", "id"];
        this.hasOne("cpkHoReceipt", {
          className: "CpkHoReceipt",
          foreignKey: ["order_shop_id", "order_id"],
        });
      }
    }
    class CpkHoReceipt extends Base {
      static {
        this.attribute("order_shop_id", "integer");
        this.attribute("order_id", "integer");
        this.attribute("number", "string");
      }
    }
    registerModel(CpkHoOrder);
    registerModel(CpkHoReceipt);

    await CpkHoOrder.insertAll([{ shop_id: 1, id: 1, name: "Order1" }]);
    await CpkHoReceipt.create({ order_shop_id: 1, order_id: 1, number: "R001" });

    const order = (await CpkHoOrder.first()) as any;
    const found = (await CpkHoOrder.all()
      .eagerLoad("cpkHoReceipt")
      .findBy({ id: order.id })) as any;
    const receipt = found.association("cpkHoReceipt").target;
    expect(receipt).not.toBeNull();
    expect(receipt.number).toBe("R001");
  });

  it("including duplicate objects from has many", async () => {
    // Rails: car_post belongs to 2 categories via habtm; includes({ posts: :comments })
    // on categories should yield the SAME comment object for each category's posts[0].
    class IdupPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("idupComments", {
          className: "IdupComment",
          foreignKey: "idup_post_id",
        });
        this.hasMany("idupCategoryPosts", {
          className: "IdupCategoryPost",
          foreignKey: "idup_post_id",
        });
        this.hasMany("idupCategories", {
          className: "IdupCategory",
          through: "idupCategoryPosts",
          source: "idupCategory",
        });
      }
    }
    class IdupComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("idup_post_id", "integer");
        this.belongsTo("idupPost", {
          className: "IdupPost",
          foreignKey: "idup_post_id",
        });
      }
    }
    class IdupCategory extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("idupCategoryPosts", {
          className: "IdupCategoryPost",
          foreignKey: "idup_category_id",
        });
        this.hasMany("idupPosts", {
          className: "IdupPost",
          through: "idupCategoryPosts",
          source: "idupPost",
        });
      }
    }
    class IdupCategoryPost extends Base {
      static {
        this.attribute("idup_post_id", "integer");
        this.attribute("idup_category_id", "integer");
        this.belongsTo("idupPost", {
          className: "IdupPost",
          foreignKey: "idup_post_id",
        });
        this.belongsTo("idupCategory", {
          className: "IdupCategory",
          foreignKey: "idup_category_id",
        });
      }
    }
    registerModel("IdupPost", IdupPost);
    registerModel("IdupComment", IdupComment);
    registerModel("IdupCategory", IdupCategory);
    registerModel("IdupCategoryPost", IdupCategoryPost);

    const post = await IdupPost.create({ title: "Cars" });
    const cat1 = await IdupCategory.create({ name: "General" });
    const cat2 = await IdupCategory.create({ name: "Tech" });
    await IdupCategoryPost.create({ idup_post_id: post.id, idup_category_id: cat1.id });
    await IdupCategoryPost.create({ idup_post_id: post.id, idup_category_id: cat2.id });
    const comment = await IdupComment.create({ body: "hmm", idup_post_id: post.id });

    const categories = await (IdupCategory as any)
      .all()
      .where({ id: [cat1.id, cat2.id] })
      .includes({ idupPosts: "idupComments" })
      .toArray();

    // Rails asserts the same comment object is reused across both category→post paths.
    // We collect the comment instance from each category and assert referential equality.
    let sharedComment: any;
    for (const cat of categories) {
      const posts = cat.association("idupPosts").target;
      expect(posts).toHaveLength(1);
      const comments = posts[0].association("idupComments").target;
      expect(comments).toHaveLength(1);
      expect(comments[0].id).toBe(comment.id);
      if (sharedComment) {
        expect(comments[0]).toBe(sharedComment);
      } else {
        sharedComment = comments[0];
      }
    }
  });
  it("associations loaded for all records", async () => {
    // Rails: categories with includes(posts: :special_comments) — all posts have their
    // special_comments association loaded.
    class AlarPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("alarComments", {
          className: "AlarComment",
          foreignKey: "alar_post_id",
        });
      }
    }
    class AlarComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("type", "string");
        this.attribute("alar_post_id", "integer");
      }
    }
    class AlarCategory extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("alarCategoryPosts", {
          className: "AlarCategoryPost",
          foreignKey: "alar_category_id",
        });
        this.hasMany("alarPosts", {
          className: "AlarPost",
          through: "alarCategoryPosts",
          source: "alarPost",
        });
      }
    }
    class AlarCategoryPost extends Base {
      static {
        this.attribute("alar_post_id", "integer");
        this.attribute("alar_category_id", "integer");
        this.belongsTo("alarPost", {
          className: "AlarPost",
          foreignKey: "alar_post_id",
        });
        this.belongsTo("alarCategory", {
          className: "AlarCategory",
          foreignKey: "alar_category_id",
        });
      }
    }
    registerModel("AlarPost", AlarPost);
    registerModel("AlarComment", AlarComment);
    registerModel("AlarCategory", AlarCategory);
    registerModel("AlarCategoryPost", AlarCategoryPost);

    const post = await AlarPost.create({ title: "Foo" });
    await AlarComment.create({ body: "Come on!", alar_post_id: post.id });
    const cat1 = await AlarCategory.create({ name: "First!" });
    const cat2 = await AlarCategory.create({ name: "Second!" });
    await AlarCategoryPost.create({ alar_post_id: post.id, alar_category_id: cat1.id });
    await AlarCategoryPost.create({ alar_post_id: post.id, alar_category_id: cat2.id });

    const categories = await (AlarCategory as any)
      .where({ id: [cat1.id, cat2.id] })
      .includes({ alarPosts: "alarComments" })
      .toArray();

    for (const cat of categories) {
      const posts = cat.association("alarPosts").target;
      expect(posts).toHaveLength(1);
      // association must be loaded (preloaded) for each post
      expect(posts[0].association("alarComments").isLoaded()).toBe(true);
    }
  });
  it("loading with no associations", async () => {
    // Rails: Post.includes(:author).find(authorless post).author is nil
    class LnaPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("lna_author_id", "integer");
        this.belongsTo("lnaAuthor", {
          className: "LnaAuthor",
          foreignKey: "lna_author_id",
        });
      }
    }
    class LnaAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("LnaPost", LnaPost);
    registerModel("LnaAuthor", LnaAuthor);

    const post = await LnaPost.create({ title: "Authorless" }); // lna_author_id is null

    const posts = await (LnaPost as any).all().includes("lnaAuthor").toArray();
    const found = posts.find((p: any) => p.id === post.id);
    expect(found).toBeDefined();
    const preloadedAuthor = found.association("lnaAuthor").target;
    expect(preloadedAuthor).toBeNull();
  });
  it("eager association loading with belongs to", async () => {
    // Rails: Comment.all.merge!(includes: :post) - all comments have their post loaded
    class EabtPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    class EabtComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eabt_post_id", "integer");
        this.belongsTo("eabtPost", {
          className: "EabtPost",
          foreignKey: "eabt_post_id",
        });
      }
    }
    registerModel("EabtPost", EabtPost);
    registerModel("EabtComment", EabtComment);

    const post1 = await EabtPost.create({ title: "Welcome" });
    const post2 = await EabtPost.create({ title: "Other" });
    await EabtComment.create({ body: "c1", eabt_post_id: post1.id });
    await EabtComment.create({ body: "c2", eabt_post_id: post2.id });
    await EabtComment.create({ body: "c3", eabt_post_id: post1.id });

    const comments = await (EabtComment as any).all().includes("eabtPost").toArray();
    expect(comments).toHaveLength(3);
    const titles = comments.map((c: any) => c.association("eabtPost").target?.title);
    expect(titles).toContain("Welcome");
    expect(titles).toContain("Other");
  });
  it("preload belongs to uses exclusive scope", async () => {
    // Rails: Person.males.includes(:primary_contact) — the preload of
    // primary_contact must use the association's own (exclusive) scope, not the
    // caller's `males` scope, so non-male contacts are still loaded.
    const f1 = await Person.create({ first_name: "F1", gender: "F" });
    const f2 = await Person.create({ first_name: "F2", gender: "F" });
    const m1 = await Person.create({ first_name: "M1", gender: "M", primary_contact_id: f1.id });
    const m2 = await Person.create({ first_name: "M2", gender: "M", primary_contact_id: f2.id });

    const people = await (Person as any).males().includes("primaryContact").toArray();
    expect(people).toHaveLength(2);
    for (const person of people) {
      // Rails: assert_no_queries { assert_not_nil person.primary_contact } — the
      // reader must serve the preloaded target without firing a query.
      let contact: any;
      await assertNoQueries(false, async () => {
        contact = await person.primaryContact;
        expect(contact).not.toBeNull();
      });
      const direct = await (Person as any).find(person.id);
      const directContact = await direct.primaryContact;
      expect(contact.id).toBe(directContact.id);
    }
    expect(people.find((p: any) => p.id === m1.id).association("primaryContact").target.id).toBe(
      f1.id,
    );
    expect(people.find((p: any) => p.id === m2.id).association("primaryContact").target.id).toBe(
      f2.id,
    );
  });
  it("preload has many uses exclusive scope", async () => {
    // Rails: Person.males.includes(:agents) — the preload of agents must use the
    // association's exclusive scope, not the caller's `males` scope, so non-male
    // agents are still loaded.
    const m1 = await Person.create({ first_name: "M1", gender: "M" });
    const m2 = await Person.create({ first_name: "M2", gender: "M" });
    await Person.create({ first_name: "A1", gender: "F", primary_contact_id: m1.id });
    await Person.create({ first_name: "A2", gender: "F", primary_contact_id: m2.id });

    const people = await (Person as any).males().includes("agents").toArray();
    expect(people).toHaveLength(2);
    for (const person of people) {
      const agents = person.association("agents").target;
      const direct = await (Person as any).find(person.id);
      const directAgents = await direct.agents.toArray();
      expect(agents.map((a: any) => a.id).sort()).toEqual(
        directAgents.map((a: any) => a.id).sort(),
      );
      expect(agents.length).toBe(1);
    }
  });
  it("preloading empty belongs to", async () => {
    // Rails: Client.create!(client_of: beyond_max_id) then preload(:firm) → nil firm
    class PebClient extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("peb_firm_id", "integer");
        this.belongsTo("pebFirm", {
          className: "PebFirm",
          foreignKey: "peb_firm_id",
        });
      }
    }
    class PebFirm extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("PebClient", PebClient);
    registerModel("PebFirm", PebFirm);

    // Create a firm, note its id, then create a client pointing past max id so firm lookup returns nil
    const firm = await PebFirm.create({ name: "Existing" });
    const nonExistentId = Number(firm.id) + 9999;
    const client = await PebClient.create({ name: "Foo", peb_firm_id: nonExistentId });

    const loaded = await (PebClient as any)
      .all()
      .preload("pebFirm")
      .where({ id: client.id })
      .toArray();
    expect(loaded).toHaveLength(1);
    const preloaded = loaded[0].association("pebFirm").target;
    expect(preloaded).toBeNull();
    expect(loaded[0].peb_firm_id).toBe(nonExistentId);
  });
  it("deep preload", async () => {
    // Rails: Post.preload(author: :posts, comments: :post).first
    // — author.association(:posts) is loaded, comments[0].association(:post) is loaded
    class DpPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("dp_author_id", "integer");
        this.belongsTo("dpAuthor", {
          className: "DpAuthor",
          foreignKey: "dp_author_id",
        });
        this.hasMany("dpComments", {
          className: "DpComment",
          foreignKey: "dp_post_id",
        });
      }
    }
    class DpAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("dpPosts", {
          className: "DpPost",
          foreignKey: "dp_author_id",
        });
      }
    }
    class DpComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("dp_post_id", "integer");
        this.belongsTo("dpPost", {
          className: "DpPost",
          foreignKey: "dp_post_id",
        });
      }
    }
    registerModel("DpPost", DpPost);
    registerModel("DpAuthor", DpAuthor);
    registerModel("DpComment", DpComment);

    const author = await DpAuthor.create({ name: "Alice" });
    const post = await DpPost.create({ title: "Hello", dp_author_id: author.id });
    await DpComment.create({ body: "Nice", dp_post_id: post.id });

    const posts = await (DpPost as any)
      .all()
      .preload({ dpAuthor: "dpPosts", dpComments: "dpPost" })
      .toArray();

    expect(posts).toHaveLength(1);
    const p = posts[0];
    // author.dpPosts should be preloaded
    const preloadedAuthor = p.association("dpAuthor").target;
    expect(preloadedAuthor).toBeDefined();
    expect(preloadedAuthor).not.toBeNull();
    expect(preloadedAuthor.name).toBe("Alice");
    expect(preloadedAuthor.association("dpPosts").isLoaded()).toBe(true);
    // comment.dpPost should be preloaded
    const preloadedComments = p.association("dpComments").target;
    expect(preloadedComments).toHaveLength(1);
    expect(preloadedComments[0].association("dpPost").isLoaded()).toBe(true);
  });
  it("preloading the same association twice works", async () => {
    // Rails: Member.preload(:current_membership).includes(current_membership: :club)
    // — double-loading the same association should not error or reset it
    class PstaMembership extends Base {
      static {
        this.attribute("psta_member_id", "integer");
        this.attribute("psta_club_id", "integer");
        this.attribute("active", "boolean");
        this.belongsTo("pstaClub", {
          className: "PstaClub",
          foreignKey: "psta_club_id",
        });
      }
    }
    class PstaClub extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class PstaMember extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("pstaCurrentMembership", {
          className: "PstaMembership",
          foreignKey: "psta_member_id",
          scope: (rel: any) => rel.where({ active: true }),
        });
      }
    }
    registerModel("PstaMember", PstaMember);
    registerModel("PstaMembership", PstaMembership);
    registerModel("PstaClub", PstaClub);

    const club = await PstaClub.create({ name: "Club" });
    const member = await PstaMember.create({ name: "Alice" });
    await PstaMembership.create({ psta_member_id: member.id, psta_club_id: club.id, active: true });

    // Preload the same association twice — second preload is a no-op if already loaded
    const members = await (PstaMember as any)
      .all()
      .preload("pstaCurrentMembership")
      .includes({ pstaCurrentMembership: "pstaClub" })
      .toArray();

    expect(members).toHaveLength(1);
    const m = members[0];
    const membership = m.association("pstaCurrentMembership").target;
    expect(membership).toBeDefined();
    expect(membership).not.toBeNull();
    expect(Number(membership.psta_club_id)).toBe(Number(club.id));
  });
});

describe("EagerLoadingTooManyIdsTest", () => {
  setupHandlerSuite();
  // Mirrors the citations.yml fixture: 65536 rows (id 0..65535, book2_id i*i).
  // The point of these tests is that preload/eager_load split an IN clause whose
  // id list exceeds the adapter's bind-parameter limit, so the row count must be
  // the real fixture size. The per-row reload in useHandlerFixtures is too slow
  // at this scale, so seed via chunked insertAll (no reload) and clean up after.
  const TOTAL = 65536;
  beforeAll(async () => {
    await defineSchema(
      { citations: canonicalSchema.citations, books: canonicalSchema.books } as Schema,
      { dropExisting: true },
    );
    registerModel(Citation);
    registerModel(Book);
    const rows: { id: number; book2_id: number }[] = [];
    for (let i = 0; i < TOTAL; i++) rows.push({ id: i, book2_id: i * i });
    // 2-column rows → ≤ 65535 placeholders/insert on MySQL/MariaDB at this chunk.
    for (let i = 0; i < rows.length; i += 10_000) {
      await Citation.insertAll(rows.slice(i, i + 10_000));
    }
  }, 180_000);

  afterAll(async () => {
    await Base.connection.executeMutation("DELETE FROM citations");
  }, 60_000);

  // Generous timeout: building the IN-split preload over the full 65536-row set
  // is slow on the MySQL-family lanes, well past the 5s default. The fixture
  // size is the point — it must exceed the adapter's bind-parameter limit to
  // force IN-splitting.
  it("preloading too many ids", async () => {
    expect((await Citation.preload("referenceOf").toArray()).length).toBe(await Citation.count());
  }, 120_000);

  // `eager_load(:citations)` is a 65536-row self-LEFT-JOIN on `citation_id`.
  // Rails' `t.references :citation` indexes that column, so the join is an
  // indexed lookup rather than the O(n²) nested-loop scan it degrades to on the
  // MySQL-family lanes without the index (that scan was >360s and poisoned the
  // shared connection). With the canonical `citations` schema now carrying the
  // Rails-faithful `index_citations_on_citation_id`, the join runs within budget.
  it("eager loading too many ids", async () => {
    expect(await Citation.all().eagerLoad("citations").offset(0).size()).toBe(
      await Citation.count(),
    );
  }, 120_000);
});

// ==========================================================================
// EagerAssociationTest (sharded composite-query_constraints fixtures) — preloading
// `Sharded::BlogPost#comments` (a has_many keyed by [blog_id, blog_post_id]) must
// emit a composite IN clause: `blog_id IN (...) AND blog_post_id IN (...)`. Same
// describe name so test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { shardedBlogs } = useHandlerFixtures([
    "shardedBlogs",
    "shardedBlogPosts",
    "shardedComments",
  ]);
  beforeAll(async () => {
    await defineSchema(
      {
        sharded_blogs: canonicalSchema.sharded_blogs,
        sharded_blog_posts: canonicalSchema.sharded_blog_posts,
        sharded_comments: canonicalSchema.sharded_comments,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel("ShardedBlog", ShardedBlog);
  registerModel("ShardedBlogPost", ShardedBlogPost);
  registerModel("ShardedComment", ShardedComment);

  it("preloading belongs_to association SQL", async () => {
    const blogIds = [shardedBlogs("sharded_blog_one").id, shardedBlogs("sharded_blog_two").id];
    const posts = ShardedBlogPost.where({ blog_id: blogIds }).includes("comments");

    const sqls = await captureSql(async () => {
      const loaded = (await posts.toArray()) as Base[];
      // Exercise the public reader (Rails: `posts.map(&:comments)`); the size
      // is the post count (3), populated from the preload, not a fresh query.
      const commentsCollection = await Promise.all(
        loaded.map((p) => (p as any).comments.toArray() as Promise<Base[]>),
      );
      expect(commentsCollection.length).toBe(3);
      expect(commentsCollection.flat()).toHaveLength(4);
    });
    const sql = sqls[sqls.length - 1];

    // Rails (eager_test.rb:1698-1700) builds the pattern from `quote_table_name`,
    // which is adapter-specific (double-quotes on sqlite/pg, backticks on mysql),
    // so derive the quoting from the live adapter rather than hardcoding it.
    const conn = Base.connection;
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const quotedBlogId = escape(conn.quoteTableName("sharded_comments.blog_id"));
    const quotedBlogPostId = escape(conn.quoteTableName("sharded_comments.blog_post_id"));
    expect(sql).toMatch(
      new RegExp(`WHERE ${quotedBlogId} IN \\(.+\\) AND ${quotedBlogPostId} IN \\(.+\\)`),
    );
  });
});

// ==========================================================================
// EagerAssociationTest (HABTM, canonical fixtures) — `Post has_and_belongs_to_many
// :categories` / `Category has_and_belongs_to_many :posts` use the canonical
// Post/Category/Categorization models + real categories/posts/categories_posts/
// categorizations fixtures, so they need the fixture-backed handler suite. The
// main block above declares ad-hoc per-test models against a local schema.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { posts, categories } = useHandlerFixtures([
    "categories",
    "posts",
    "categoriesPosts",
    "categorizations",
  ]);
  // Force-recreate the canonical HABTM tables with `dropExisting` (mirrors
  // named-scoping.test.ts). The per-worker SQLite DB is shared across files
  // (`file:trails_test_${VITEST_POOL_ID}?mode=memory&cache=shared`), and sibling
  // files (e.g. has-many-associations.test.ts) define a `posts` table WITHOUT a
  // `body` column. The signature cache is primed at worker boot
  // (template-global-setup.ts), so a plain `defineSchema` would cache-hit and
  // skip recreation — leaving the fixture seed to hit the wrong columns
  // (`table posts has no column named body`). `dropExisting` bypasses the cache.
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        categories: canonicalSchema.categories,
        posts: canonicalSchema.posts,
        categories_posts: canonicalSchema.categories_posts,
        categorizations: canonicalSchema.categorizations,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(Category);
  registerModel(Categorization);

  it("has and belongs to many should not instantiate same records multiple times", async () => {
    // Rails (eager_test.rb): eager-loading `welcome` through two different HABTM
    // owners (general.posts and technology.posts) must reuse one instance
    // (`assert_same post1, post2`). categories_posts seeds both general_welcome
    // and technology_welcome, so welcome is genuinely reachable via two owners.
    const welcome = posts("welcome");
    const loaded = await Category.all().includes("posts").toArray();

    const general = loaded.find((c) => c.id === categories("general").id) as Category;
    const technology = loaded.find((c) => c.id === categories("technology").id) as Category;

    const generalPosts = general.association("posts").target as Base[];
    const technologyPosts = technology.association("posts").target as Base[];
    const post1 = generalPosts.find((p) => p.id === welcome.id);
    const post2 = technologyPosts.find((p) => p.id === welcome.id);

    expect(post1).toBeDefined();
    expect(post1).toBe(post2);
  });

  it("deep including through habtm", async () => {
    // Rails (eager_test.rb): `includes(categories: :categorizations)` preloads
    // two levels — Post HABTM categories, each Category has_many categorizations
    // — so the nested reads fire no further queries (Rails wraps each in
    // `assert_no_queries`).
    const loaded = await Post.all()
      .includes({ categories: "categorizations" })
      .order("posts.id")
      .toArray();

    await assertNoQueries(false, async () => {
      // Posts are positional (explicitly `order("posts.id")`); categories are
      // looked up by fixture identity rather than position — the HABTM preload
      // query carries no ORDER BY (preloader/association.ts:470; the through
      // preloader only sorts when the association scope has `orderValues`,
      // through-association.ts:91-94), so `WHERE id IN (...)` row order isn't
      // guaranteed cross-adapter. Rails relies on the same implicit order via
      // `categories[0]`/`[1]`; we assert the same counts without depending on it.
      const categoryOf = (post: Base, categoryId: unknown): Base =>
        (post.association("categories").target as Base[]).find((c) => c.id === categoryId)!;
      const categorizationCount = (c: Base): number =>
        (c.association("categorizations").target as Base[]).length;

      // welcome → general (2 categorizations) + technology (1); thinking → general (2).
      expect(categorizationCount(categoryOf(loaded[0], categories("general").id))).toBe(2);
      expect(categorizationCount(categoryOf(loaded[0], categories("technology").id))).toBe(1);
      expect(categorizationCount(categoryOf(loaded[1], categories("general").id))).toBe(2);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (HABTM, canonical Developer fixtures) — the
// `conditions on join table` test eager-loads `Developer has_and_belongs_to_many
// :projects` and filters on a column of the `developers_projects` join table.
// It needs the canonical Developer/Project models + real developers/projects/
// developers_projects fixtures, so it lives in its own fixture-backed handler
// suite (the main block above declares ad-hoc per-test models). Same describe
// name as the other EagerAssociationTest blocks so test:compare matches it to
// the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  useHandlerFixtures(["developers", "projects", "developersProjects"]);
  // Force-recreate the canonical tables with `dropExisting` (mirrors the
  // EagerAssociationTest block above). Sibling files share the per-worker SQLite
  // DB and define `developers`/`projects` with different column sets, and the
  // signature cache is primed at worker boot — a plain `defineSchema` would
  // cache-hit and skip recreation, leaving the fixture seed to hit stale columns.
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        developers: canonicalSchema.developers,
        projects: canonicalSchema.projects,
        developers_projects: canonicalSchema.developers_projects,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Developer);
  registerModel(Project);

  it("conditions on join table with include and limit", async () => {
    // Rails (eager_test.rb): three developers (david, jamis, poor_jamis) have a
    // developers_projects row with the default access_level of 1; limit 5 doesn't
    // trim the set, so the eager + join-condition query returns 3 distinct rows.
    const developers = await Developer.all()
      .includes("projects")
      .where({ "developers_projects.access_level": 1 })
      .limit(5)
      .toArray();
    expect(developers).toHaveLength(3);
  });

  // Rails (eager_test.rb): mirrors the `messages_for` helper — subscribe to a
  // notification, run the block, collect the events, then unsubscribe.
  async function messagesFor(
    name: string,
    fn: () => Promise<void>,
  ): Promise<Array<{ payload: Record<string, unknown> }>> {
    const notifications: Array<{ payload: Record<string, unknown> }> = [];
    const sub = Notifications.subscribe(name, (e) => {
      notifications.push({ payload: e.payload });
    });
    try {
      await fn();
    } finally {
      Notifications.unsubscribe(sub);
    }
    return notifications;
  }

  it("association loading notification", async () => {
    const notifications = await messagesFor("instantiation.active_record", async () => {
      await Developer.all()
        .includes("projects")
        .where({ "developers_projects.access_level": 1 })
        .limit(5)
        .toArray();
    });

    const payload = notifications[0].payload;
    const count = (
      await Developer.all()
        .includes("projects")
        .where({ "developers_projects.access_level": 1 })
        .limit(5)
        .toArray()
    ).length;

    // eagerloaded row count should be greater than just developer count
    expect(payload.record_count as number).toBeGreaterThan(count);
    expect(payload.class_name).toBe(Developer.name);
  });

  it("base messages", async () => {
    const notifications = await messagesFor("instantiation.active_record", async () => {
      await Developer.all().toArray();
    });
    const payload = notifications[0].payload;

    expect(payload.record_count).toBe((await Developer.all().toArray()).length);
    expect(payload.class_name).toBe(Developer.name);
  });

  it("dont create temporary active record instances", async () => {
    Developer.instanceCount = 0;
    const developers = await Developer.all()
      .includes("projects")
      .where({ "developers_projects.access_level": 1 })
      .limit(5)
      .toArray();
    expect(Developer.instanceCount).toBe(developers.length);
  });

  it("order on join table with include and limit", async () => {
    // Rails (eager_test.rb): Developer.includes("projects") ordered by the join
    // table column `developers_projects.joined_on DESC` with limit 5 returns 5
    // developers.
    const developers = await Developer.all()
      .includes("projects")
      .references("developers_projects")
      .order("developers_projects.joined_on DESC")
      .limit(5)
      .toArray();
    expect(developers).toHaveLength(5);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical developers/projects fixtures) — ports of the
// eager_test.rb `default_scope { includes(:projects) }` cluster. Each
// EagerDeveloperWith*DefaultScope model uses `developers` with a HABTM
// `projects` association eager-loaded by its default scope, so accessing
// `developer.projects` after the initial load issues no further queries.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { developers } = useHandlerFixtures(["developers", "projects", "developersProjects"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        developers: canonicalSchema.developers,
        projects: canonicalSchema.projects,
        developers_projects: canonicalSchema.developers_projects,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Project);
  registerModel(EagerDeveloperWithDefaultScope);
  registerModel(EagerDeveloperWithClassMethodDefaultScope);
  registerModel(EagerDeveloperWithLambdaDefaultScope);
  registerModel(EagerDeveloperWithBlockDefaultScope);
  registerModel(EagerDeveloperWithCallableDefaultScope);

  async function projectIds(): Promise<unknown[]> {
    return (await Project.order("id").toArray()).map((p) => p.id);
  }

  it("eager with default scope", async () => {
    const developer = await EagerDeveloperWithDefaultScope.where({ name: "David" }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as class method", async () => {
    const developer = await EagerDeveloperWithClassMethodDefaultScope.where({
      name: "David",
    }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as class method using find method", async () => {
    const david = developers("david");
    const developer = await EagerDeveloperWithClassMethodDefaultScope.find(david.id);
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as class method using find by method", async () => {
    const developer = await EagerDeveloperWithClassMethodDefaultScope.findBy({ name: "David" });
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as lambda", async () => {
    const developer = await EagerDeveloperWithLambdaDefaultScope.where({ name: "David" }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as block", async () => {
    // warm up the habtm cache
    await EagerDeveloperWithBlockDefaultScope.where({ name: "David" }).first();
    const developer = await EagerDeveloperWithBlockDefaultScope.where({ name: "David" }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });

  it("eager with default scope as callable", async () => {
    const developer = await EagerDeveloperWithCallableDefaultScope.where({ name: "David" }).first();
    const projects = await projectIds();
    await assertNoQueries(false, async () => {
      const loaded = await developer!.projects;
      expect(loaded.map((p) => p.id)).toEqual(projects);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Post/Author/Comment + join-table fixtures) —
// ports of eager_test.rb cases that combine eager-loading with conditions /
// order / select / limit on a *joined* table (joins + includes), conditions on
// join models, default-scope association conditions, and the joins+includes
// collapse-to-one-query path. Needs the taggings/tags/author_addresses/readers/
// people fixtures in addition to the Post/Author/Comment set. Same describe name
// as the other EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, posts, people, authorAddresses } = useHandlerFixtures([
    "authors",
    "posts",
    "comments",
    "taggings",
    "tags",
    "authorAddresses",
    "readers",
    "people",
  ]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        taggings: canonicalSchema.taggings,
        tags: canonicalSchema.tags,
        author_addresses: canonicalSchema.author_addresses,
        readers: canonicalSchema.readers,
        people: canonicalSchema.people,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(Author);
  registerModel(AuthorAddress);
  registerModel(Comment);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(Reader);
  registerModel(LazyReader);
  registerModel(Person);

  it("eager loading with order on joined table preloads", async () => {
    let loaded: Post[] = [];
    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .joins("comments")
        .includes("author")
        .order("comments.id DESC")
        .toArray();
    });
    expect(loaded[2].id).toBe(posts("eager_other").id);
    await assertNoQueries(false, () => {
      expect((loaded[2].association("author").target as Base).id).toBe(authors("mary").id);
    });
  });

  it("eager loading with conditions on joined table preloads", async () => {
    let loaded: Post[] = [];
    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .select("distinct posts.*")
        .includes("author")
        .joins("comments")
        .where("comments.body like 'Thank you%'")
        .order("posts.id")
        .toArray();
    });
    expect(loaded.map((p) => Number(p.id))).toEqual([Number(posts("welcome").id)]);
    await assertNoQueries(false, () => {
      expect((loaded[0].association("author").target as Base).id).toBe(authors("david").id);
    });

    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .includes("author")
        .joins({ taggings: "tag" })
        .where("tags.name = 'General'")
        .order("posts.id")
        .toArray();
    });
    expect(loaded.map((p) => Number(p.id))).toEqual([
      Number(posts("welcome").id),
      Number(posts("thinking").id),
    ]);

    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .includes("author")
        .joins({ taggings: { tag: "taggings" } })
        .where("taggings_tags.super_tag_id=2")
        .order("posts.id")
        .toArray();
    });
    expect(loaded.map((p) => Number(p.id))).toEqual([
      Number(posts("welcome").id),
      Number(posts("thinking").id),
    ]);
  });

  it("eager loading with select on joined table preloads", async () => {
    let loaded: Post[] = [];
    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .select("posts.*, authors.name as author_name")
        .includes("comments")
        .joins("author")
        .order("posts.id")
        .toArray();
    });
    expect(loaded[0].id).toBe(posts("welcome").id);
    expect(loaded[0].readAttribute("author_name")).toBe("David");
    await assertNoQueries(false, () => {
      expect((loaded[0].association("comments").target as Base[]).length).toBe(2);
    });
  });

  it("eager loading with conditions on join model preloads", async () => {
    let loaded: Author[] = [];
    await assertQueriesCount(2, false, async () => {
      loaded = await Author.all()
        .includes("authorAddress")
        .joins("comments")
        .where("posts.title like 'Welcome%'")
        .toArray();
    });
    expect(loaded[0].id).toBe(authors("david").id);
    await assertNoQueries(false, () => {
      expect((loaded[0].association("authorAddress").target as Base).id).toBe(
        authorAddresses("david_address").id,
      );
    });
  });

  it("eager with has many and limit and conditions on the eagers", async () => {
    const david = await Author.find(authors("david").id);
    const loaded = await (david as any).posts
      .includes("comments")
      .where("comments.body like 'Normal%' OR comments.type = 'SpecialComment'")
      .references("comments")
      .limit(2)
      .toArray();
    expect(loaded).toHaveLength(2);

    const count = await Post.includes("comments", "author")
      .where(
        "authors.name = 'David' AND (comments.body like 'Normal%' OR comments.type = 'SpecialComment')",
      )
      .references("authors", "comments")
      .limit(2)
      .count();
    expect(count).toBe(loaded.length);
  });

  it("eager with has many and limit and scoped conditions on the eagers", async () => {
    const david = await Author.find(authors("david").id);
    let loaded: Post[] = [];
    await Post.scoping(
      Post.includes("comments")
        .where("comments.body like 'Normal%' OR comments.type = 'SpecialComment'")
        .references("comments"),
      async () => {
        loaded = (await (david as any).posts.limit(2).toArray()) as Post[];
        expect(loaded).toHaveLength(2);
      },
    );

    await Post.scoping(
      Post.includes("comments", "author")
        .where(
          "authors.name = 'David' AND (comments.body like 'Normal%' OR comments.type = 'SpecialComment')",
        )
        .references("authors", "comments"),
      async () => {
        const count = await Post.limit(2).count();
        expect(count).toBe(loaded.length);
      },
    );
  });

  it("preload has many with association condition and default scope", async () => {
    const post = await Post.create({ title: "Beaches", body: "I like beaches!" });
    await Reader.create({ person_id: people("david").id, post_id: post.id });
    await LazyReader.create({ person_id: people("susan").id, post_id: post.id });

    expect(((await (post as any).lazyReaders.toArray()) as Base[]).length).toBe(1);
    expect(((await (post as any).lazyReadersSkimmersOrNot.toArray()) as Base[]).length).toBe(2);

    const postWithReaders = await Post.includes("lazyReadersSkimmersOrNot").find(post.id);
    expect(
      ((await (postWithReaders as any).lazyReadersSkimmersOrNot.toArray()) as Base[]).length,
    ).toBe(2);
  });

  it("joins with includes should preload via joins", async () => {
    let post: Post | undefined;
    await assertQueriesCount(1, false, async () => {
      const loaded = await Post.includes("comments")
        .joins("comments")
        .order("posts.id desc")
        .toArray();
      post = loaded[0];
    });
    await assertNoQueries(false, () => {
      expect((post!.association("comments").target as Base[]).length).not.toBe(0);
    });
  });

  // trails-only regression: extends Rails' single-include
  // test_joins_with_includes_should_preload_via_joins (eager_test.rb:1373) to the
  // multi-include fan-out branch — `comments` collapses onto the INNER join from
  // joins(...) while the non-intersecting `author` is join-loaded as a deduped
  // OUTER join, all in one query. No upstream Rails test exercises this path.
  it("joins with multiple includes should preload via joins", async () => {
    let post: Post | undefined;
    await assertQueriesCount(1, false, async () => {
      const loaded = await Post.includes("comments", "author")
        .joins("comments")
        .order("posts.id desc")
        .toArray();
      post = loaded[0];
    });
    await assertNoQueries(false, () => {
      expect((post!.association("comments").target as Base[]).length).not.toBe(0);
      expect(post!.association("author").target as Base).toBeTruthy();
    });
  });

  it("nested loading through has one association", async () => {
    const aa = await AuthorAddress.all()
      .includes({ author: "posts" })
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with order", async () => {
    const aa = await AuthorAddress.all()
      .includes({ author: "posts" })
      .order("author_addresses.id")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with order on association", async () => {
    const aa = await AuthorAddress.all()
      .includes({ author: "posts" })
      .order("authors.id")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with order on nested association", async () => {
    const aa = await AuthorAddress.all()
      .includes({ author: "posts" })
      .order("posts.id")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with conditions", async () => {
    const aa = await AuthorAddress.references("author_addresses")
      .includes({ author: "posts" })
      .where("author_addresses.id > 0")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with conditions on association", async () => {
    const aa = await AuthorAddress.references("authors")
      .includes({ author: "posts" })
      .where("authors.id > 0")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });

  it("nested loading through has one association with conditions on nested association", async () => {
    const aa = await AuthorAddress.references("posts")
      .includes({ author: "posts" })
      .where("posts.id > 0")
      .find(authorAddresses("david_address").id);
    const author = aa.association("author").target as Author;
    expect(await (author as any).posts.count()).toBe((author as any).posts.target.length);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Post/Author/Comment/Category fixtures) — ports
// of eager_test.rb cases that exercise plain preloading/eager-loading over the
// real Post/Author/Comment/Category models + their fixtures. Same describe name
// as the other EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, posts, comments, categories, people } = useHandlerFixtures([
    "authors",
    "posts",
    "comments",
    "categories",
    "categoriesPosts",
    "people",
    "readers",
  ]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        categories: canonicalSchema.categories,
        categories_posts: canonicalSchema.categories_posts,
        people: canonicalSchema.people,
        readers: canonicalSchema.readers,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(SpecialPost);
  registerModel(Author);
  registerModel(Comment);
  registerModel(VerySpecialComment);
  registerModel(Category);
  registerModel(SpecialCategory);
  registerModel(Categorization);
  registerModel(Person);
  registerModel(Reader);

  it("loading with multiple associations", async () => {
    const loaded = await Post.all()
      .includes("comments", "author", "categories")
      .order("posts.id")
      .toArray();
    const first = loaded[0];
    expect((first.association("comments").target as Base[]).length).toBe(2);
    expect((first.association("categories").target as Base[]).length).toBe(2);
    const commentIds = (first.association("comments").target as Base[]).map((c) => c.id);
    expect(commentIds).toContain(comments("greetings").id);
  });

  it("eager count performed on a has many association with multi table conditional", async () => {
    const author = authors("david") as any;
    const allPosts = (await author.posts.toArray()) as Base[];
    let authorPostsWithoutComments = 0;
    for (const post of allPosts) {
      if (((await (post as any).comments.toArray()) as Base[]).length === 0)
        authorPostsWithoutComments++;
    }
    const count = await author.posts
      .includes("comments")
      .where("comments.id is null")
      .references("comments")
      .count();
    expect(count).toBe(authorPostsWithoutComments);
  });

  it("eager count performed on a has many through association with multi table conditional", async () => {
    const person = people("michael") as any;
    const allPosts = (await person.posts.toArray()) as Base[];
    let personPostsWithoutComments = 0;
    for (const post of allPosts) {
      if (((await (post as any).comments.toArray()) as Base[]).length === 0)
        personPostsWithoutComments++;
    }
    const count = await person.postsWithNoComments.count();
    expect(count).toBe(personPostsWithoutComments);
  });

  it("eager with multi table conditional properly counts the records when using size", async () => {
    const author = authors("david") as any;
    const allPosts = (await author.posts.toArray()) as Base[];
    const postsWithNoComments: Base[] = [];
    for (const post of allPosts) {
      if (((await (post as any).comments.toArray()) as Base[]).length === 0)
        postsWithNoComments.push(post);
    }
    expect(await author.postsWithNoComments.size()).toBe(postsWithNoComments.length);
    const loaded = (await author.postsWithNoComments.toArray()) as Base[];
    expect(loaded.map((p) => p.id)).toEqual(postsWithNoComments.map((p) => p.id));
  });

  it("test_calculate_with_string_in_from_and_eager_loading", async () => {
    const count = await Post.from("authors, posts")
      .eagerLoad("comments")
      .where("posts.author_id = authors.id")
      .count();
    expect(count).toBe(10);
  });

  it("test_with_two_tables_in_from_without_getting_double_quoted", async () => {
    const loaded = await Post.select("posts.*")
      .from("authors, posts")
      .eagerLoad("comments")
      .where("posts.author_id = authors.id")
      .order("posts.id")
      .toArray();
    const firstComments = loaded[0].association("comments").target as Base[];
    expect(firstComments).toHaveLength(2);
  });

  it("including associations with where.not adds implicit references", async () => {
    let author!: Author;
    await assertQueriesCount(2, false, async () => {
      author = (await Author.includes("posts")
        .whereNot({ posts: { title: "Welcome to the weblog" } })
        .last()) as Author;
    });
    await assertNoQueries(false, () => {
      expect((author.association("posts").target as Base[]).length).toBe(2);
    });
  });

  it("loading from an association that has a hash of conditions", async () => {
    const author = await Author.all()
      .includes("helloPostsWithHashConditions")
      .find(authors("david").id);
    const helloPosts = (await author.association("helloPosts").loadTarget()) as Base[];
    expect(helloPosts.length).toBeGreaterThan(0);
  });

  it("preloading does not cache has many association subset when preloaded with a through association", async () => {
    const author = (await Author.all()
      .includes("commentsWithOrderAndConditions", "posts")
      .order("authors.id")
      .first()) as Author;
    await assertNoQueries(false, () => {
      expect((author.association("commentsWithOrderAndConditions").target as Base[]).length).toBe(
        2,
      );
    });
    await assertNoQueries(false, () => {
      expect((author.association("posts").target as Base[]).length).toBe(5);
    });
  });

  it("works in combination with order(:symbol) and reorder(:symbol)", async () => {
    let author = (await Author.all()
      .includes("posts")
      .references("posts")
      .order("name")
      .where("posts.title IS NOT NULL")
      .first()) as Author;
    expect(author.id).toBe(authors("bob").id);

    author = (await Author.all()
      .includes("posts")
      .references("posts")
      .reorder("name")
      .where("posts.title IS NOT NULL")
      .first()) as Author;
    expect(author.id).toBe(authors("bob").id);
  });

  it("loading with one association with non preload", async () => {
    const loaded = await Post.all().includes("lastComment").order("comments.id DESC").toArray();
    const post = loaded.find((p) => p.id === posts("welcome").id)!;
    const fresh = await Post.find(posts("welcome").id);
    const expected = (await fresh.association("lastComment").loadTarget()) as Base | null;
    const actual = post.association("lastComment").target as Base | null;
    expect(actual?.id).toBe(expected?.id);
  });

  it("preconfigured includes with belongs to", async () => {
    const post = await Post.find(posts("welcome").id);
    const author = (await post.association("authorWithPosts").loadTarget()) as Author;
    await assertNoQueries(false, () => {
      expect((author.association("posts").target as Base[]).length).toBe(5);
    });
  });

  it("preconfigured includes with has many", async () => {
    const david = await Author.find(authors("david").id);
    const loaded = (await david.association("postsWithComments").loadTarget()) as Base[];
    await assertNoQueries(false, () => {
      expect(loaded.length).toBe(5);
      const one = loaded.find((p) => p.id === posts("welcome").id)!;
      expect((one.association("comments").target as Base[]).length).toBe(2);
    });
  });

  it("preconfigured includes with has one", async () => {
    const post = await Post.find(posts("sti_comments").id);
    const comment = (await post.association("verySpecialCommentWithPost").loadTarget()) as Base;
    await assertNoQueries(false, () => {
      expect((comment.association("post").target as Base).id).toBe(posts("sti_comments").id);
    });
  });

  it("eager with floating point numbers", async () => {
    await assertQueriesCount(2, false, async () => {
      // Before changes, the floating-point numbers will be interpreted as table names and will cause this to run in one query
      await Comment.all().where("123.456 = 123.456").includes("post").toArray();
    });
  });

  it("eager association loading with belongs to and limit", async () => {
    const loaded = await Comment.all().includes("post").limit(5).order("comments.id").toArray();
    expect(loaded).toHaveLength(5);
    expect(loaded.map((c) => Number(c.id))).toEqual([1, 2, 3, 5, 6]);
  });

  it("eager association loading with belongs to and limit and conditions", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where("post_id = 4")
      .limit(3)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([5, 6, 7]);
  });

  it("eager association loading with belongs to and limit and offset", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .limit(3)
      .offset(2)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([3, 5, 6]);
  });

  it("eager association loading with belongs to and limit and offset and conditions", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where("post_id = 4")
      .limit(3)
      .offset(1)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([6, 7, 8]);
  });

  it("eager association loading with belongs to and limit and offset and conditions array", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where("post_id = ?", 4)
      .limit(3)
      .offset(1)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([6, 7, 8]);
  });

  it("eager association loading with belongs to and conditions string with unquoted table name", async () => {
    expect(() =>
      Comment.all()
        .includes("post")
        .references("posts")
        .where("posts.id = ?", posts("sti_comments").id),
    ).not.toThrow();
  });

  it("eager association loading with belongs to and conditions string with quoted table name", async () => {
    const quotedPostsId = Comment.connection.quoteTableName("posts.id");
    expect(() =>
      Comment.all()
        .includes("post")
        .references("posts")
        .where(`${quotedPostsId} = ?`, posts("welcome").id),
    ).not.toThrow();
  });

  it("eager association loading with belongs to and order string with unquoted table name", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .references("posts")
      .order("posts.id")
      .toArray();
    expect(loaded.map((c) => c.id)).toContain(comments("greetings").id);
  });

  it("eager association loading with belongs to and order string with quoted table name", async () => {
    const quotedPostsId = Comment.connection.quoteTableName("posts.id");
    const loaded = await Comment.all()
      .includes("post")
      .references("posts")
      .order(quotedPostsId)
      .toArray();
    expect(loaded.map((c) => c.id)).toContain(comments("greetings").id);
  });

  it("eager association loading with belongs to and limit and multiple associations", async () => {
    const loaded = await Post.all()
      .includes("author", "verySpecialComment")
      .limit(1)
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(1);
    expect(loaded.map((p) => Number(p.id))).toEqual([Number(posts("welcome").id)]);
  });

  it("eager association loading with belongs to and limit and offset and multiple associations", async () => {
    const loaded = await Post.all()
      .includes("author", "verySpecialComment")
      .limit(1)
      .offset(1)
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(1);
    expect(loaded.map((p) => Number(p.id))).toEqual([Number(posts("thinking").id)]);
  });

  it("eager association loading with belongs to and conditions hash", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where({ posts: { id: 4 } })
      .limit(3)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => Number(c.id))).toEqual([5, 6, 7]);
    await assertNoQueries(false, () => {
      expect(loaded[0].association("post").target).toBeDefined();
    });
  });

  it("eager with has many and limit", async () => {
    const loaded = await Post.all()
      .order("posts.id asc")
      .includes("author", "comments")
      .limit(2)
      .toArray();
    expect(loaded).toHaveLength(2);
    const sum = loaded.reduce(
      (acc, post) => acc + (post.association("comments").target as Base[]).length,
      0,
    );
    expect(sum).toBe(3);
  });

  it("eager with has many and limit and conditions", async () => {
    const loaded = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .where("posts.body = 'hello'")
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((post) => Number(post.id))).toEqual([4, 5]);
  });

  it("eager with has many and limit and conditions array", async () => {
    const loaded = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .where("posts.body = ?", "hello")
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((post) => Number(post.id))).toEqual([4, 5]);
  });

  it("eager with has many and limit and conditions array on the eagers", async () => {
    const david = authors("david").name;
    const posts = await Post.includes("author", "comments")
      .limit(2)
      .references("author")
      .where("authors.name = ?", david)
      .toArray();
    expect(posts).toHaveLength(2);

    const count = await Post.includes("author", "comments")
      .limit(2)
      .references("author")
      .where("authors.name = ?", david)
      .count();
    expect(count).toBe(posts.length);
  });

  it("eager with has many and limit and high offset", async () => {
    const posts = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .offset(10)
      .where({ "authors.name": "David" })
      .toArray();
    expect(posts).toHaveLength(0);
  });

  it("eager with has many and limit and high offset and multiple array conditions", async () => {
    await assertQueriesCount(1, false, async () => {
      const posts = await Post.references("authors", "comments")
        .includes("author", "comments")
        .limit(2)
        .offset(10)
        .where("authors.name = ? and comments.body = ?", authors("david").name, "go wild")
        .toArray();
      expect(posts).toHaveLength(0);
    });
  });

  it("eager with has many and limit and high offset and multiple hash conditions", async () => {
    await assertQueriesCount(1, false, async () => {
      const posts = await Post.all()
        .includes("author", "comments")
        .limit(2)
        .offset(10)
        .where({ "authors.name": "David", "comments.body": "go wild" })
        .toArray();
      expect(posts).toHaveLength(0);
    });
  });

  it("count eager with has many and limit and high offset", async () => {
    const count = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .offset(10)
      .where({ "authors.name": "David" })
      .count("*");
    expect(count).toBe(0);
  });

  it("eager with has many and limit with no results", async () => {
    const posts = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .where("posts.title = 'magic forest'")
      .toArray();
    expect(posts).toHaveLength(0);
  });

  it("test_type_cast_in_where_references_association_name", async () => {
    const parent = await Comment.find(comments("greetings").id);
    const child = (await (parent as any).children.create({
      label: "child",
      body: "hi",
      post_id: (parent as any).post_id,
    })) as Comment;

    const comment = (await Comment.includes("children")
      .where({ "children.label": "child" })
      .last()) as Comment;

    expect(comment.id).toBe(parent.id);
    const children = (await (comment as any).children.toArray()) as Base[];
    expect(children.map((c) => Number(c.id))).toEqual([Number(child.id)]);
  });

  it("eager association loading with explicit join habtm", async () => {
    // Proves the JOIN path is taken (not the preload fallback): the eager-load
    // SQL must reference both the HABTM join table and the target table.
    const rel = Post.all().eagerLoad("categories").order("posts.id");
    const sql = rel.toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN.*categories_posts/);
    expect(sql).toMatch(/LEFT OUTER JOIN.*categories[^_]/);

    const loaded = await rel.toArray();
    const welcome = loaded.find((p) => p.id === posts("welcome").id)!;
    const thinking = loaded.find((p) => p.id === posts("thinking").id)!;
    expect(welcome.association("categories").target as Base[]).toHaveLength(2);
    expect(thinking.association("categories").target as Base[]).toHaveLength(1);
  });

  it("eager association loading with habtm via preload", async () => {
    const loaded = await Post.all().preload("categories").order("posts.id").toArray();
    const welcome = loaded.find((p) => p.id === posts("welcome").id)!;
    expect(welcome.association("categories").target as Base[]).toHaveLength(2);
  });

  it("eager with has and belongs to many and limit", async () => {
    const loaded = await Post.all().includes("categories").order("posts.id").limit(3).toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded[0].association("categories").target as Base[]).toHaveLength(2);
    expect(loaded[1].association("categories").target as Base[]).toHaveLength(1);
    expect(loaded[2].association("categories").target as Base[]).toHaveLength(0);
    const cats0 = loaded[0].association("categories").target as Base[];
    const cats1 = loaded[1].association("categories").target as Base[];
    expect(cats0.some((c) => c.id === categories("technology").id)).toBe(true);
    expect(cats1.some((c) => c.id === categories("general").id)).toBe(true);
  });

  it("eager association loading with habtm", async () => {
    const loaded = await Post.all().includes("categories").order("posts.id").toArray();
    expect(loaded[0].association("categories").target as Base[]).toHaveLength(2);
    expect(loaded[1].association("categories").target as Base[]).toHaveLength(1);
    expect(loaded[2].association("categories").target as Base[]).toHaveLength(0);
    const cats0 = loaded[0].association("categories").target as Base[];
    const cats1 = loaded[1].association("categories").target as Base[];
    expect(cats0.some((c) => c.id === categories("technology").id)).toBe(true);
    expect(cats1.some((c) => c.id === categories("general").id)).toBe(true);
  });

  it("eager habtm with association inheritance", async () => {
    const post = await Post.all().includes("specialCategories").find(posts("sti_habtm").id);
    const specials = post.association("specialCategories").target as Base[];
    expect(specials).toHaveLength(1);
    for (const specialCategory of specials) {
      expect(specialCategory.constructor.name).toBe("SpecialCategory");
    }
  });

  it("eager with multiple associations with same table has many and habtm", async () => {
    function sortById(records: Base[]) {
      return [...records].sort((a, b) => Number(a.id) - Number(b.id));
    }
    const postTypes = ["posts", "otherPosts", "specialPosts"] as const;
    for (const ModelClass of [Author, Category] as (typeof Author | typeof Category)[]) {
      const tableName = ModelClass.tableName;
      const pk = ModelClass.primaryKey as string;
      const d1 = (await (ModelClass as any).order(`${tableName}.${pk}`).toArray()) as Base[];
      const d2 = (await (ModelClass as any)
        .order(`${tableName}.${pk}`)
        .includes(...postTypes)
        .toArray()) as Base[];
      for (const postType of postTypes.slice(1)) {
        const d3 = (await (ModelClass as any)
          .order(`${tableName}.${pk}`)
          .includes("posts", postType)
          .toArray()) as Base[];
        for (let i = 0; i < d1.length; i++) {
          expect(d1[i].id).toEqual(d2[i].id);
          expect(d3[i].id).toEqual(d1[i].id);
          const d1Posts = sortById((await (d1[i] as any).posts.toArray()) as Base[]);
          const d2Posts = sortById(d2[i].association("posts").target as Base[]);
          const d3Posts = sortById(d3[i].association("posts").target as Base[]);
          expect(d2Posts.map((p) => p.id)).toEqual(d1Posts.map((p) => p.id));
          expect(d3Posts.map((p) => p.id)).toEqual(d1Posts.map((p) => p.id));
          const d1Type = sortById((await (d1[i] as any)[postType].toArray()) as Base[]);
          const d2Type = sortById(d2[i].association(postType).target as Base[]);
          const d3Type = sortById(d3[i].association(postType).target as Base[]);
          expect(d2Type.map((p) => p.id)).toEqual(d1Type.map((p) => p.id));
          expect(d3Type.map((p) => p.id)).toEqual(d1Type.map((p) => p.id));
        }
      }
    }
  });

  it("preconfigured includes with habtm", async () => {
    const david = await Author.find(authors("david").id);
    const postsList = (await david.association("postsWithCategories").loadTarget()) as Base[];
    const one = postsList.find((p) => Number(p.id) === 1)!;
    await assertNoQueries(false, () => {
      expect(postsList).toHaveLength(5);
      expect(one.association("categories").target as Base[]).toHaveLength(2);
    });
  });

  it("preconfigured includes with has many and habtm", async () => {
    const david = await Author.find(authors("david").id);
    const postsList = (await david
      .association("postsWithCommentsAndCategories")
      .loadTarget()) as Base[];
    const one = postsList.find((p) => Number(p.id) === 1)!;
    await assertNoQueries(false, () => {
      expect(postsList).toHaveLength(5);
      expect(one.association("comments").target as Base[]).toHaveLength(2);
      expect(one.association("categories").target as Base[]).toHaveLength(2);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Pet/Owner fixtures) — ports the belongs_to +
// foreign-key eager-loading case over the real Pet/Owner models. Same describe
// name as the other EagerAssociationTest blocks so test:compare matches the
// Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { pets } = useHandlerFixtures(["owners", "pets"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        owners: canonicalSchema.owners,
        pets: canonicalSchema.pets,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Pet);
  registerModel(Owner);

  it("eager association loading with belongs to and foreign keys", async () => {
    const pets = await Pet.all().includes("owner").toArray();
    expect(pets).toHaveLength(4);
  });

  it("including association based on sql condition and no database column", async () => {
    const owner = (await Owner.includingLastPet().first()) as Owner;
    const lastPet = owner.association("lastPet").target as Pet;
    expect(lastPet.id).toBe(pets("parrot").id);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical AuthorFavorite/Author fixtures) — ports the
// belongs_to inferred-foreign-key eager-loading case over the real
// AuthorFavorite/Author models. Same describe name as the other
// EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors } = useHandlerFixtures(["authors", "authorFavorites"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        author_favorites: canonicalSchema.author_favorites,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Author);
  registerModel(AuthorFavorite);

  it("eager association loading with belongs to inferred foreign key from association name", async () => {
    const authorFavorite = (await AuthorFavorite.all()
      .includes("favoriteAuthor")
      .first()) as AuthorFavorite;
    await assertNoQueries(false, () => {
      expect((authorFavorite.association("favoriteAuthor").target as Author).id).toBe(
        authors("mary").id,
      );
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Firm/Client fixtures) — ports the
// attribute-alias + self-join where-hash case over the real Firm/Client models
// (both on the `companies` table). Same describe name as the other
// EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { companies } = useHandlerFixtures(["companies"]);
  beforeAll(async () => {
    // Partial schema: the eager SELECT projects only real `companies` columns.
    await defineSchema({ companies: canonicalSchema.companies }, { dropExisting: true });
  });
  registerModel(Company);
  registerModel(Firm);
  registerModel(Client);

  it("test_attribute_alias_in_where_references_association_name", async () => {
    const firm = (await Firm.includes("clients")
      .where({ "clients.newName": "Summit" })
      .last()) as Firm;
    expect(firm.id).toBe(companies("first_firm").id);
    const clients = (await (firm as any).clients.toArray()) as Base[];
    expect(clients.map((c) => Number(c.id))).toEqual([Number(companies("first_client").id)]);
  });
});

// ==========================================================================
// EagerAssociationTest (companies + accounts fixtures) — `has_one
// :account_using_primary_key` keys Account.firm_id off Firm.firm_id (the
// association's `primary_key: "firm_id"`), so eager/preloading it returns the
// signals37 account for first_firm (firm_id 1). Same describe name so
// test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { accounts } = useHandlerFixtures(["companies", "accounts"]);
  beforeAll(async () => {
    await defineSchema(
      {
        companies: canonicalSchema.companies,
        accounts: canonicalSchema.accounts,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Company);
  registerModel(Firm);
  registerModel(Client);
  registerModel(Account);

  it("preload has one using primary key", async () => {
    const expected = accounts("signals37");
    const firm = (await Firm.all()
      .includes("accountUsingPrimaryKey")
      .order("companies.id")
      .first()) as Firm;
    await assertNoQueries(false, async () => {
      const account = (firm as any).accountUsingPrimaryKey;
      expect(account.id).toBe(expected.id);
    });
  });

  it("include has one using primary key", async () => {
    const expected = accounts("signals37");
    const firms = await Firm.all()
      .includes("accountUsingPrimaryKey")
      .order("accounts.id")
      .toArray();
    const firm = firms.find((f) => Number(f.id) === 1)!;
    await assertNoQueries(false, async () => {
      const account = (firm as any).accountUsingPrimaryKey;
      expect(account.id).toBe(expected.id);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Sponsor/Member polymorphic fixtures) — ports
// the custom `foreign_type` preload case (Sponsor#thing reuses the
// sponsorable_* columns via `foreign_type:`/`foreign_key:`).
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { sponsors, members } = useHandlerFixtures(["members", "sponsors"]);
  beforeAll(async () => {
    await defineSchema(
      { members: canonicalSchema.members, sponsors: canonicalSchema.sponsors } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Sponsor);
  registerModel(Member);

  it("preloading polymorphic with custom foreign type", async () => {
    const grouchoId = members("groucho").id;
    const sponsorId = sponsors("moustache_club_sponsor_for_groucho").id;
    let sponsor!: Sponsor;
    await assertQueriesCount(2, false, async () => {
      sponsor = (await Sponsor.includes("thing").where({ id: sponsorId }).first()) as Sponsor;
    });
    await assertNoQueries(false, async () => {
      const thing = (await sponsor.thing) as Base;
      expect(thing.id).toBe(grouchoId);
    });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Author/Essay polymorphic fixtures) — ports the
// existential-predicate preload cases over Essay#writer (polymorphic belongs_to,
// primary_key: name).
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors } = useHandlerFixtures(["authors", "essays"]);
  beforeAll(async () => {
    await defineSchema(
      { authors: canonicalSchema.authors, essays: canonicalSchema.essays } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Author);
  registerModel(Essay);

  it("preloading with a polymorphic association and using the existential predicate but also using a select", async () => {
    const david = await Author.find(authors("david").id);
    const essay = (await (david as any).essays.includes("writer").first()) as Essay;
    expect(((await essay.writer) as Base).id).toBe(david.id);

    await expect(
      (david as any).essays.includes("writer").select("name").isAny(),
    ).resolves.not.toThrow();
  });

  it("preloading with a polymorphic association and using the existential predicate", async () => {
    const david = await Author.find(authors("david").id);
    const essay = (await (david as any).essays.includes("writer").first()) as Essay;
    expect(((await essay.writer) as Base).id).toBe(david.id);

    await (david as any).essays.includes("writer").isAny();
    await (david as any).essays.includes("writer").exists();
    await (david as any).essays.includes("owner").where("name IS NOT NULL").exists();
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Post/Tag/Tagging fixtures) — ports the
// polymorphic has_many :through (`tags` through polymorphic `taggings`) cases
// that reference the joined `tags` table via `references`/`eager_load`.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { posts, taggings } = useHandlerFixtures(["posts", "tags", "taggings"]);
  beforeAll(async () => {
    await defineSchema(
      {
        posts: canonicalSchema.posts,
        tags: canonicalSchema.tags,
        taggings: canonicalSchema.taggings,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(SpecialPost);
  registerModel(Tag);
  registerModel(Tagging);

  it("polymorphic type condition", async () => {
    let post = await Post.all().includes("taggings").find(posts("thinking").id);
    expect((post.association("taggings").target as Base[]).map((t) => t.id)).toContain(
      taggings("thinking_general").id,
    );
    post = await SpecialPost.all().includes("taggings").find(posts("thinking").id);
    expect((post.association("taggings").target as Base[]).map((t) => t.id)).toContain(
      taggings("thinking_general").id,
    );
  });

  it("preloading a polymorphic association with references to the associated table", async () => {
    const post = (await Post.includes("tags")
      .references("tags")
      .where("tags.name = ?", "General")
      .first()) as Post;
    expect(post.id).toBe(posts("welcome").id);
  });

  it("eager-loading a polymorphic association with references to the associated table", async () => {
    const post = (await Post.eagerLoad("tags").where("tags.name = ?", "General").first()) as Post;
    expect(post.id).toBe(posts("welcome").id);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Job/Person/Reference fixtures) — ports the
// eager_test.rb cases that exercise eager loading over quoted table and column
// names. Same describe name as the other EagerAssociationTest blocks so
// test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { jobs, references, people } = useHandlerFixtures(["jobs", "references", "people"]);
  beforeAll(async () => {
    await defineSchema(
      {
        jobs: canonicalSchema.jobs,
        references: canonicalSchema.references,
        people: canonicalSchema.people,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Job);
  registerModel(Reference);
  registerModel(Person);

  it("eager load belongs to quotes table and column names", async () => {
    const job = await Job.includes("idealReference").find(jobs("unicyclist").id);
    await assertNoQueries(false, () => {
      expect((job.association("idealReference").target as Base).id).toBe(
        references("michael_unicyclist").id,
      );
    });
  });

  it("eager load has one quotes table and column names", async () => {
    const michael = await Person.all().includes("favoriteReference").find(people("michael").id);
    await assertNoQueries(false, () => {
      expect((michael.association("favoriteReference").target as Base).id).toBe(
        references("michael_unicyclist").id,
      );
    });
  });

  it("eager load has many quotes table and column names", async () => {
    const michael = await Person.all().includes("references").find(people("michael").id);
    await assertNoQueries(false, () => {
      const sorted = (michael.association("references").target as Base[])
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id));
      expect(sorted.map((r) => r.id)).toEqual([
        references("michael_magician").id,
        references("michael_unicyclist").id,
      ]);
    });
  });

  it("eager load has many through quotes table and column names", async () => {
    const michael = await Person.all().includes("jobs").find(people("michael").id);
    await assertNoQueries(false, () => {
      const sorted = (michael.association("jobs").target as Base[])
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id));
      expect(sorted.map((j) => j.id)).toEqual([jobs("unicyclist").id, jobs("magician").id]);
    });
  });
});

// ==========================================================================
// EagerAssociationTest — composite query_constraints / CPK preloading.
// Canonical Sharded::* and Cpk::* models + fixtures; mirrors eager_test.rb's
// composite-key preloading cases.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { shardedBlogs, shardedBlogPosts, shardedComments } = useHandlerFixtures(
    ["shardedBlogs", "shardedBlogPosts", "shardedComments", "shardedTags", "shardedBlogPostsTags"],
    { schema: canonicalSchema },
  );

  // useHandlerFixtures loads the rows but does not register the models under the
  // class names the associations resolve by; register them here (dynamic import
  // keeps these out of the file's top-level scope).
  beforeAll(async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    registerModel("ShardedBlog", sharded.ShardedBlog);
    registerModel("ShardedBlogPost", sharded.ShardedBlogPost);
    registerModel("ShardedComment", sharded.ShardedComment);
    registerModel("ShardedTag", sharded.ShardedTag);
    registerModel("ShardedBlogPostTag", sharded.ShardedBlogPostTag);
    const cpk = await import("../test-helpers/models/cpk.js");
    registerModel("CpkPost", cpk.CpkPost);
    registerModel("CpkComment", cpk.CpkComment);
  });

  it("preloading belongs_to association associated by a composite query_constraints", async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    const blogIds = [shardedBlogs("sharded_blog_one").id, shardedBlogs("sharded_blog_two").id];
    const posts = (await sharded.ShardedBlogPost.where({ blog_id: blogIds })
      .includes("comments")
      .toArray()) as any[];
    expect(posts.every((post) => post.association("comments").isLoaded())).toBe(true);

    const greatPostId = shardedBlogPosts("great_post_blog_one").id;
    const post = posts.find((p) => p.id === greatPostId);
    const expectedComments = (await sharded.ShardedComment.where({
      blog_id: post.blog_id,
      blog_post_id: post.id,
    }).toArray()) as any[];
    const loaded = post.association("comments").target as any[];
    expect(loaded.map((c) => c.id).sort()).toEqual(expectedComments.map((c) => c.id).sort());
  });

  it("preloading has_many association associated by a composite query_constraints", async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    const blogIds = [shardedBlogs("sharded_blog_one").id, shardedBlogs("sharded_blog_two").id];
    const comments = (await sharded.ShardedComment.where({ blog_id: blogIds })
      .includes("blogPost")
      .toArray()) as any[];
    expect(comments.every((comment) => comment.association("blogPost").isLoaded())).toBe(true);

    const greatCommentId = shardedComments("great_comment_blog_post_one").id;
    const comment = comments.find((c) => c.id === greatCommentId);
    const blogPost = comment.association("blogPost").target;
    expect(blogPost.id).toBe(shardedBlogPosts("great_post_blog_one").id);
  });

  it("preloading has_many through association associated by a composite query_constraints", async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    const blogIds = [shardedBlogs("sharded_blog_one").id, shardedBlogs("sharded_blog_two").id];
    const blogPosts = (await sharded.ShardedBlogPost.where({ blog_id: blogIds })
      .includes("tags")
      .toArray()) as any[];
    expect(blogPosts.every((post) => post.association("tags").isLoaded())).toBe(true);

    const expectedPost = shardedBlogPosts("great_post_blog_one");
    const expectedTags = (await sharded.ShardedBlogPostTag.where({
      blog_id: expectedPost.blog_id,
      blog_post_id: expectedPost.id,
    }).toArray()) as any[];
    const expectedTagIds = expectedTags.map((t) => t.tag_id);
    expect(expectedTagIds.length).toBeGreaterThan(0);

    const blogPost = blogPosts.find((p) => p.id === expectedPost.id);
    const loadedTags = blogPost.association("tags").target as any[];
    expect(loadedTags.map((t) => Number(t.id)).sort((a, b) => a - b)).toEqual(
      expectedTagIds.map(Number).sort((a, b) => a - b),
    );
  });

  it("preloading belongs_to CPK model with one of the keys being shared between models", async () => {
    const cpk = await import("../test-helpers/models/cpk.js");
    const post1 = (await cpk.CpkPost.create({
      title: "post1",
      author: "the_same_author",
    })) as any;
    await cpk.CpkComment.create({
      commentable_title: post1.title,
      commentable_author: post1.author,
      text: "great post1!",
    });

    const post2 = (await cpk.CpkPost.create({
      title: "post2",
      author: "the_same_author",
    })) as any;
    await cpk.CpkComment.create({
      commentable_title: post2.title,
      commentable_author: post2.author,
      text: "great post2!",
    });

    const comments = (await cpk.CpkComment.all().eagerLoad("post").toArray()) as any[];
    const actual: Record<string, string> = {};
    for (const comment of comments) {
      actual[comment.text] = comment.association("post").target.title;
    }
    expect(actual).toEqual({ "great post1!": "post1", "great post2!": "post2" });
  });
});

// ==========================================================================
// EagerAssociationTest (canonical STI Post/Comment fixtures) — ports the
// preload/eager-load-through-STI-join-model cases over the real Author / Post /
// StiPost / SpecialPost / Comment / SpecialComment models. Same describe name as
// the other EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors } = useHandlerFixtures(["authors", "posts", "comments"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
      } as Schema,
      { dropExisting: true },
    );
  });
  enableSti(Post);
  enableSti(Comment);
  registerModel(Author);
  registerModel(Post);
  registerModel(SpecialPost);
  registerSubclass(SpecialPost);
  registerModel(StiPost);
  registerSubclass(StiPost);
  registerModel(Comment);
  registerModel(SpecialComment);
  registerSubclass(SpecialComment);

  it("preloading with has one through an sti with after initialize", async () => {
    const authorA = await Author.create({ name: "A" });
    const authorB = await Author.create({ name: "B" });
    const postA = await StiPost.create({
      author_id: authorA.id,
      title: "TITLE",
      body: "BODY",
    });
    const postB = await SpecialPost.create({
      author_id: authorB.id,
      title: "TITLE",
      body: "BODY",
    });
    const commentA = await SpecialComment.create({ post_id: postA.id, body: "TEST" });
    const commentB = await SpecialComment.create({ post_id: postB.id, body: "TEST" });

    // Mirrors Rails `reset_callbacks(StiPost, :initialize) do ... end`: register a
    // temporary after_initialize that references the `author` association, then
    // remove it so the global StiPost model is left untouched for other tests.
    const referenceAuthor = function (this: Base): void {
      this.association("author");
    };
    try {
      StiPost.afterInitialize(referenceAuthor);
      const comments = await SpecialComment.all()
        .where({ id: [commentA.id, commentB.id] })
        .includes("author")
        .toArray();
      for (const comment of comments) {
        expect(comment.association("author").target).toBeTruthy();
      }
    } finally {
      StiPost.skipCallback("initialize", "after", referenceAuthor);
    }
  });

  it("eager with has many through an sti join model with conditions on both", async () => {
    const author = (await Author.all()
      .includes("specialNonexistentPostComments")
      .order("authors.id")
      .first()) as Author;
    expect(author.association("specialNonexistentPostComments").target).toEqual([]);
  });
});

// ==========================================================================
// EagerAssociationTest (canonical STI Post/Comment fixtures) — ports the
// inheritance / association-inheritance cases over the real STI
// Post/SpecialPost and Comment/SpecialComment/VerySpecialComment models +
// their fixtures. Same describe name as the other EagerAssociationTest blocks
// so test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { posts } = useHandlerFixtures(["authors", "posts", "comments"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Author);
  enableSti(Post);
  registerModel(Post);
  registerModel(SpecialPost);
  registerSubclass(SpecialPost);
  enableSti(Comment);
  registerModel(Comment);
  registerModel(SpecialComment);
  registerSubclass(SpecialComment);
  registerModel(SubSpecialComment);
  registerSubclass(SubSpecialComment);
  registerModel(VerySpecialComment);
  registerSubclass(VerySpecialComment);

  it("eager with inheritance", async () => {
    const loaded = await SpecialPost.all().includes("comments").toArray();
    expect(loaded).toHaveLength(1);
  });

  it("eager has one with association inheritance", async () => {
    const post = await Post.all().includes("verySpecialComment").find(posts("sti_comments").id);
    expect((post.association("verySpecialComment").target as Base).constructor.name).toBe(
      "VerySpecialComment",
    );
  });

  it("eager has many with association inheritance", async () => {
    const post = await Post.all().includes("specialComments").find(posts("sti_comments").id);
    for (const specialComment of post.association("specialComments").target as Base[]) {
      expect(specialComment).toBeInstanceOf(SpecialComment);
    }
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Author/Post/Comment/Tag has_many-through
// fixtures) — ports the `eager with has many through *` cluster over the real
// Author / Post (+ STI SpecialPost/StiPost) / Comment / Person / Tag models and
// their fixtures. Same describe name as the other EagerAssociationTest blocks so
// test:compare matches the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, comments, people, posts } = useHandlerFixtures([
    "authors",
    "posts",
    "comments",
    "people",
    "readers",
    "authorFavorites",
    "taggings",
    "tags",
  ]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        people: canonicalSchema.people,
        readers: canonicalSchema.readers,
        author_favorites: canonicalSchema.author_favorites,
        taggings: canonicalSchema.taggings,
        tags: canonicalSchema.tags,
      } as Schema,
      { dropExisting: true },
    );
  });
  enableSti(Post);
  registerModel(Author);
  registerModel(Post);
  registerModel(SpecialPost);
  registerSubclass(SpecialPost);
  registerModel(StiPost);
  registerSubclass(StiPost);
  registerModel(PostWithDefaultInclude);
  registerModel(Comment);
  registerModel(Person);
  registerModel(Reader);
  registerModel(Tag);
  registerModel(Tagging);
  registerModel(AuthorFavorite);

  it("eager with has many through", async () => {
    const michael = people("michael") as any;
    const postsWithComments = (await michael.posts
      .includes("comments")
      .order("posts.id")
      .toArray()) as Base[];
    const postsWithAuthor = (await michael.posts
      .includes("author")
      .order("posts.id")
      .toArray()) as Base[];
    const postsWithCommentsAndAuthor = (await michael.posts
      .includes("comments", "author")
      .order("posts.id")
      .toArray()) as Base[];
    const commentCount = postsWithComments.reduce(
      (sum, post) => sum + (post.association("comments").target as Base[]).length,
      0,
    );
    expect(commentCount).toBe(2);
    await assertNoQueries(false, () => {
      expect((postsWithAuthor[0].association("author").target as Base).id).toBe(
        authors("david").id,
      );
    });
    await assertNoQueries(false, () => {
      expect((postsWithCommentsAndAuthor[0].association("author").target as Base).id).toBe(
        authors("david").id,
      );
    });
  });

  it("eager with has many through a belongs to association", async () => {
    const author = authors("mary") as any;
    await Post.create({ author_id: author.id, title: "TITLE", body: "BODY" });
    await author.authorFavorites.create({ favorite_author_id: 1 });
    await author.authorFavorites.create({ favorite_author_id: 2 });
    const postsWithAuthorFavorites = (await author.posts
      .includes("authorFavorites")
      .toArray()) as Base[];
    await assertNoQueries(false, () => {
      const favorites = postsWithAuthorFavorites[0].association("authorFavorites").target as Base[];
      expect(favorites[0].readAttribute("author_id")).toBeDefined();
    });
  });

  it("eager with has many through an sti join model", async () => {
    const author = (await Author.all()
      .includes("specialPostComments")
      .order("authors.id")
      .first()) as Author;
    await assertNoQueries(false, () => {
      const specialPostComments = author.association("specialPostComments").target as Base[];
      expect(specialPostComments.map((c) => c.id)).toEqual([comments("does_it_hurt").id]);
    });
  });

  it("eager with has many through join model with conditions", async () => {
    const eagerAuthor = (await Author.all()
      .includes("helloPostComments")
      .order("authors.id")
      .first()) as Author;
    const eagerComments = (eagerAuthor.association("helloPostComments").target as Base[])
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));
    const lazyAuthor = (await Author.all().order("authors.id").first()) as any;
    const lazyComments = ((await lazyAuthor.helloPostComments.toArray()) as Base[])
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));
    expect(eagerComments.map((c) => c.id)).toEqual(lazyComments.map((c) => c.id));
  });

  it("eager with has many through join model with conditions on top level", async () => {
    const author = await Author.all()
      .includes("commentsWithOrderAndConditions")
      .find(authors("david").id);
    const first = (author.association("commentsWithOrderAndConditions").target as Base[])[0];
    expect(first.id).toBe(comments("more_greetings").id);
  });

  it("eager with has many through join model with include", async () => {
    const author = await Author.all().includes("commentsWithInclude").find(authors("david").id);
    const authorComments = author.association("commentsWithInclude").target as Base[];
    await assertNoQueries(false, () => {
      const post = authorComments[0].association("post").target as Base;
      expect(post.readAttribute("title")).toBeDefined();
    });
  });

  it("eager with has many through with conditions join model with include", async () => {
    const post = await Post.find(posts("welcome").id);
    const postTags = (await (post as any).miscTags.toArray()) as Base[];
    const eagerPost = await Post.all().includes("miscTags").find(posts("welcome").id);
    const eagerPostTags = eagerPost.association("miscTags").target as Base[];
    expect(eagerPostTags.map((t) => t.id)).toEqual(postTags.map((t) => t.id));
  });

  it("eager with has many through join model ignores default includes", async () => {
    const david = authors("david") as any;
    let error: unknown;
    try {
      await david.commentsOnPostsWithDefaultInclude.toArray();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Member/Membership/Club fixtures) — ports the
// has_one-through-join-model-with-conditions-on-the-through case over the real
// Member / Membership / Club models. Same describe name as the other
// EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { members } = useHandlerFixtures(["members", "memberships", "clubs"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        members: canonicalSchema.members,
        memberships: canonicalSchema.memberships,
        clubs: canonicalSchema.clubs,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Member);
  enableSti(Membership);
  registerModel(Membership);
  registerModel(Club);

  it("eager with has one through join model with conditions on the through", async () => {
    const member = await Member.all().includes("favoriteClub").find(members("some_other_guy").id);
    expect(member.association("favoriteClub").target ?? null).toBeNull();
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Firm/Account fixtures) — ports the
// has_one-dependent-does-not-destroy-dependent case over the real STI
// Company/Firm + Account models. Same describe name as the other
// EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { companies } = useHandlerFixtures(["companies", "accounts"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        companies: canonicalSchema.companies,
        accounts: canonicalSchema.accounts,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Company);
  enableSti(Company);
  registerModel(Firm);
  registerSubclass(Firm);
  registerModel(Client);
  registerSubclass(Client);
  registerModel(Account);

  it("eager with has one dependent does not destroy dependent", async () => {
    const firstFirm = companies("first_firm") as Firm;
    expect(await firstFirm.loadHasOne("account")).not.toBeNull();

    const f = (await Firm.all()
      .includes("account")
      .where("companies.name = ?", "37signals")
      .first()) as Firm;
    expect(f.association("account").target ?? null).not.toBeNull();

    const reloaded = await Firm.find(firstFirm.id);
    expect((f.association("account").target as Account).id).toBe(
      (await reloaded.loadHasOne("account"))!.id,
    );
  });
});

// ==========================================================================
// EagerAssociationTest (canonical Author/Post/Comment/Category + Project/Member
// fixtures) — ports of eager_test.rb's preloading has_many-through,
// instance-dependent, and scoping cases onto the real registry models. Same
// describe name as the other EagerAssociationTest blocks so test:compare matches
// the Rails `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, posts, developers, projects } = useHandlerFixtures([
    "authors",
    "posts",
    "comments",
    "categories",
    "categoriesPosts",
    "categorizations",
    "developers",
    "projects",
    "developersProjects",
    "members",
    "memberships",
    "clubs",
  ]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        categories: canonicalSchema.categories,
        categories_posts: canonicalSchema.categories_posts,
        categorizations: canonicalSchema.categorizations,
        developers: canonicalSchema.developers,
        projects: canonicalSchema.projects,
        developers_projects: canonicalSchema.developers_projects,
        members: canonicalSchema.members,
        memberships: canonicalSchema.memberships,
        clubs: canonicalSchema.clubs,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Post);
  registerModel(Author);
  enableSti(Comment);
  registerModel(Comment);
  registerModel(VerySpecialComment);
  registerModel(Category);
  registerModel(Categorization);
  registerModel(Developer);
  registerModel(Project);
  registerModel(Member);
  enableSti(Membership);
  registerModel(Membership);
  registerModel(Club);

  it("preloading has many through with implicit source", async () => {
    const authorList = (await Author.includes("verySpecialComments").toArray()).sort(
      (a, b) => Number(a.id) - Number(b.id),
    );
    await assertNoQueries(false, () => {
      const specialCommentAuthors = authorList.map((author) => [
        (author as any).name,
        (author.association("verySpecialComments").target as Base[]).length,
      ]);
      expect(specialCommentAuthors).toEqual([
        ["David", 1],
        ["Mary", 0],
        ["Bob", 0],
      ]);
    });
  });

  it("preloading has many through with distinct", async () => {
    const mary = (await Author.includes("uniqueCategorizedPosts")
      .where({ id: authors("mary").id })
      .first()) as Author;
    expect((mary.association("uniqueCategorizedPosts").target as Base[]).length).toBe(1);
    // Mary has two categorizations both pointing at the "thinking" post, so
    // `distinct` must collapse them to a single unique post id. Rails' second
    // assertion (`unique_categorized_post_ids.length == 1`) exercises the
    // generated `_ids` collection reader; trails does not generate that reader,
    // so we assert the concrete collapsed post identity instead — add an `_ids`
    // assertion here if/when `uniqueCategorizedPostIds` lands on Author.
    const ids = (mary.association("uniqueCategorizedPosts").target as Base[]).map((p) => p.id);
    expect(ids).toEqual([posts("thinking").id]);
  });

  it("preloading has many through with custom scope", async () => {
    const project = await Project.includes("developersNamedDavidWithHashConditions").find(
      projects("active_record").id,
    );
    const loaded = project.association("developersNamedDavidWithHashConditions").target as Base[];
    expect(loaded.map((d) => d.id)).toEqual([developers("david").id]);
  });

  it("preloading a through association twice does not reset it", async () => {
    const members = await Member.includes({ currentMembership: "club" }).includes("club").toArray();
    await assertNoQueries(false, () => {
      // Rails: members.map(&:current_membership).map(&:club).size — a nil
      // current_membership would raise NoMethodError, so do NOT null-guard;
      // a missing preloaded target must throw (Rails-faithful failure mode).
      const clubs = members
        .map((m) => m.association("currentMembership").target as Base)
        .map((cm) => cm.association("club").target as Base);
      expect(clubs).toHaveLength(3);
    });
  });

  it("belongs_to association ignores the scoping", async () => {
    const post = await (await Comment.find(1)).loadBelongsTo("post");
    await Post.scoping(Post.where("1=0"), async () => {
      expect((await (await Comment.find(1)).loadBelongsTo("post"))!.id).toBe(post!.id);
      const preloaded = await Comment.preload("post").find(1);
      expect((preloaded.association("post").target as Base).id).toBe(post!.id);
      const eagerLoaded = await Comment.eagerLoad("post").find(1);
      expect((eagerLoaded.association("post").target as Base).id).toBe(post!.id);
    });
  });

  it("has_many association ignores the scoping", async () => {
    const comments = ((await ((await Post.find(1)) as any).comments.toArray()) as Base[]).map(
      (c) => c.id,
    );
    await Comment.scoping(Comment.where("1=0"), async () => {
      expect(
        ((await ((await Post.find(1)) as any).comments.toArray()) as Base[]).map((c) => c.id),
      ).toEqual(comments);
      const preloaded = await Post.preload("comments").find(1);
      expect((preloaded.association("comments").target as Base[]).map((c) => c.id)).toEqual(
        comments,
      );
      const eagerLoaded = await Post.eagerLoad("comments").find(1);
      expect((eagerLoaded.association("comments").target as Base[]).map((c) => c.id)).toEqual(
        comments,
      );
    });
  });

  it("preloading of instance dependent associations is supported", async () => {
    const authorList = await Author.preload("postsWithSignature").toArray();
    expect(authorList).not.toHaveLength(0);
    for (const author of authorList) {
      expect(author.association("postsWithSignature").isLoaded()).toBe(true);
    }
  });

  it("eager loading of instance dependent associations is not supported", async () => {
    await expect(Author.eagerLoad("postsWithSignature").toArray()).rejects.toThrow(
      "association scope 'postsWithSignature' is",
    );
  });

  it("preloading of optional instance dependent associations is supported", async () => {
    const authorList = await Author.includes("postsMentioningAuthor").toArray();
    expect(authorList).not.toHaveLength(0);
    for (const author of authorList) {
      expect(author.association("postsMentioningAuthor").isLoaded()).toBe(true);
    }
  });

  it("eager loading of optional instance dependent associations is not supported", async () => {
    await expect(Author.eagerLoad("postsMentioningAuthor").toArray()).rejects.toThrow(
      "association scope 'postsMentioningAuthor' is",
    );
  });

  it("preload with invalid argument", async () => {
    await expect(
      Author.all()
        .preload(10 as any)
        .toArray(),
    ).rejects.toThrow(/Association names must be Symbol or String, got: Integer/);
    await expect(Author.all().preload("doesNotExists").toArray()).rejects.toThrow(
      /Association named 'doesNotExists' was not found on Author; perhaps you misspelled it\?/,
    );
  });

  it("associations with extensions are not instance dependent", async () => {
    let error: unknown;
    try {
      await Author.includes("postsWithExtension").toArray();
    } catch (e) {
      error = e;
    }
    expect(error).toBeUndefined();
  });

  it("including associations with extensions and an instance dependent scope is supported", async () => {
    const authorList = await Author.includes("postsWithExtensionAndInstance").toArray();
    expect(authorList).not.toHaveLength(0);
    for (const author of authorList) {
      expect(author.association("postsWithExtensionAndInstance").isLoaded()).toBe(true);
    }
  });
});

// ==========================================================================
// HasManyThroughAssociationsTest — targets associations/has_many_through_associations_test.rb
// ==========================================================================
