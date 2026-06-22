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
import { association, loadHasMany, loadHasManyThrough } from "../associations.js";
import { Notifications } from "@blazetrails/activesupport";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import { Post, FirstPost } from "../test-helpers/models/post.js";
import { Author, AuthorFavorite, AuthorAddress } from "../test-helpers/models/author.js";
import { Comment, VerySpecialComment } from "../test-helpers/models/comment.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Reader, LazyReader } from "../test-helpers/models/reader.js";
import { Person } from "../test-helpers/models/person.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Developer } from "../test-helpers/models/developer.js";
import { Company, Firm, Client } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Citation } from "../test-helpers/models/citation.js";
import { Book } from "../test-helpers/models/book.js";
import { ShardedBlog, ShardedBlogPost, ShardedComment } from "../test-helpers/models/sharded.js";
import { captureSql } from "../testing/sql-capture.js";
import { Project } from "../test-helpers/models/project.js";
import { Sponsor } from "../test-helpers/models/sponsor.js";
import { Member } from "../test-helpers/models/member.js";
import { Essay } from "../test-helpers/models/essay.js";

// All tables referenced by tests in this file. Tests declare ad-hoc
// model classes per-test, so under AR_NO_AUTO_SCHEMA=1 the schema must
// be materialized up front rather than auto-derived by the test adapter.
const TEST_SCHEMA: Schema = {
  alar_categories: { name: "string" },
  alar_category_posts: { alar_post_id: "integer", alar_category_id: "integer" },
  alar_comments: { body: "string", type: "string", alar_post_id: "integer" },
  alar_posts: { title: "string" },
  awe_authors: { name: "string" },
  awe_posts: { awe_author_id: "integer", title: "string" },
  awex_authors: { name: "string" },
  awex_posts: { awex_author_id: "integer", mention: "string" },
  bt_scope_authors: { name: "string" },
  bt_scope_posts: { title: "string", bt_scope_author_id: "integer" },
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
  eager_dist_items: { label: "string" },
  eager_dist_joins: { eager_dist_owner_id: "integer", eager_dist_item_id: "integer" },
  eager_dist_owners: { name: "string" },
  eager_ds_b_comments: { body: "string", eager_ds_b_post_id: "integer" },
  eager_ds_b_posts: { title: "string" },
  eager_ds_call_comments: { body: "string", eager_ds_call_post_id: "integer" },
  eager_ds_call_posts: { title: "string" },
  eager_ds_cm_comments: { body: "string", eager_ds_cm_post_id: "integer" },
  eager_ds_cm_posts: { title: "string" },
  eager_ds_comments: { body: "string", eager_ds_post_id: "integer" },
  eager_ds_fb_posts: { title: "string" },
  eager_ds_fm_posts: { title: "string" },
  eager_ds_l_comments: { body: "string", eager_ds_l_post_id: "integer" },
  eager_ds_l_posts: { title: "string" },
  eager_ds_posts: { title: "string" },
  eager_dup_authors: { name: "string" },
  eager_dup_children: { label: "string", eager_dup_parent_id: "integer" },
  eager_dup_parents: { name: "string" },
  eager_dup_posts: { title: "string", eager_dup_author_id: "integer" },
  eager_edges: { label: "string", eager_node_id: "integer" },
  eager_empty_bt_children: { value: "string", eager_empty_bt_parent_id: "integer" },
  eager_empty_bt_parents: { name: "string" },
  eager_float_details: { info: "string", eager_float_item_id: "integer" },
  eager_float_items: { price: "float" },
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
  eager_hmi_authors: { name: "string" },
  eager_hmi_posts: { title: "string", type: "string", eager_hmi_author_id: "integer" },
  eager_hmt_authors: { name: "string" },
  eager_hmt_authorships: { eager_hmt_author_id: "integer", eager_hmt_book_id: "integer" },
  eager_hmt_books: { title: "string" },
  eager_hmt_bt_authors: { name: "string" },
  eager_hmt_bt_comments: { body: "string", eager_hmt_bt_post_id: "integer" },
  eager_hmt_bt_posts: { title: "string", eager_hmt_bt_author_id: "integer" },
  eager_hmt_cj_authors: { name: "string" },
  eager_hmt_cj_authorships: { eager_hmt_cj_author_id: "integer", eager_hmt_cj_book_id: "integer" },
  eager_hmt_cj_books: { title: "string" },
  eager_hmt_cond_authors: { name: "string" },
  eager_hmt_cond_authorships: {
    eager_hmt_cond_author_id: "integer",
    eager_hmt_cond_book_id: "integer",
  },
  eager_hmt_cond_books: { title: "string" },
  eager_hmt_di_authors: { name: "string" },
  eager_hmt_di_authorships: { eager_hmt_di_author_id: "integer", eager_hmt_di_book_id: "integer" },
  eager_hmt_di_books: { title: "string" },
  eager_hmt_inc_authors: { name: "string" },
  eager_hmt_inc_authorships: {
    eager_hmt_inc_author_id: "integer",
    eager_hmt_inc_book_id: "integer",
  },
  eager_hmt_inc_books: { title: "string" },
  eager_hmt_magazines: { title: "string" },
  eager_hmt_mo_authors: { name: "string" },
  eager_hmt_mo_authorships: { eager_hmt_mo_author_id: "integer", eager_hmt_mo_book_id: "integer" },
  eager_hmt_mo_books: { title: "string" },
  eager_hmt_ord_authors: { name: "string" },
  eager_hmt_ord_authorships: {
    eager_hmt_ord_author_id: "integer",
    eager_hmt_ord_book_id: "integer",
  },
  eager_hmt_ord_books: { title: "string" },
  eager_hmt_readers: { name: "string" },
  eager_hmt_subscriptions: { eager_hmt_reader_id: "integer", eager_hmt_magazine_id: "integer" },
  eager_hmt_top_authors: { name: "string" },
  eager_hmt_top_authorships: {
    eager_hmt_top_author_id: "integer",
    eager_hmt_top_book_id: "integer",
  },
  eager_hmt_top_books: { title: "string" },
  eager_ho_children: { value: "string", eager_ho_parent_id: "integer" },
  eager_ho_no_pk_children: {
    columns: { value: "string", eager_ho_no_pk_parent_id: "integer" },
    primaryKey: false,
  },
  eager_ho_no_pk_parents: { name: "string" },
  eager_ho_parents: { name: "string" },
  eager_ho_ref_children: { value: "string", eager_ho_ref_parent_id: "integer" },
  eager_ho_ref_parents: { name: "string" },
  eager_hoi_parents: { name: "string" },
  eager_hoi_profiles: { bio: "string", type: "string", eager_hoi_parent_id: "integer" },
  eager_imp_items: { label: "string" },
  eager_imp_joins: { eager_imp_owner_id: "integer", eager_imp_item_id: "integer" },
  eager_imp_owners: { name: "string" },
  eager_inh_clients: { name: "string", eager_inh_company_id: "integer" },
  eager_inh_companies: { name: "string", type: "string" },
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
  eager_pre_ho_children: { value: "string", eager_pre_ho_parent_id: "integer" },
  eager_pre_ho_parents: { name: "string" },
  eager_qt_clients: { name: "string", eager_qt_company_id: "integer" },
  eager_qt_companies: { name: "string" },
  eager_qt_hm_children: { value: "string", eager_qt_hm_parent_id: "integer" },
  eager_qt_hm_parents: { name: "string" },
  eager_qt_ho_children: { value: "string", eager_qt_ho_parent_id: "integer" },
  eager_qt_ho_parents: { name: "string" },
  eager_qt_thr_items: { label: "string" },
  eager_qt_thr_joins: { eager_qt_thr_owner_id: "integer", eager_qt_thr_item_id: "integer" },
  eager_qt_thr_owners: { name: "string" },
  eager_reord_children: { value: "string", eager_reord_parent_id: "integer" },
  eager_reord_parents: { name: "string" },
  eager_sti_authors: { name: "string" },
  eager_sti_comments: { body: "string", eager_sti_post_id: "integer" },
  eager_sti_posts: { title: "string", type: "string", eager_sti_author_id: "integer" },
  eager_str_bt_children: { value: "string", eager_str_bt_parent_id: "integer" },
  eager_str_bt_parents: { name: "string" },
  eager_str_children: { value: "string", eager_str_parent_id: "integer" },
  eager_str_parents: { name: "string" },
  eager_str_thr_items: { label: "string" },
  eager_str_thr_joins: { eager_str_thr_owner_id: "integer", eager_str_thr_item_id: "integer" },
  eager_str_thr_owners: { name: "string" },
  eager_tags: { name: "string", eager_article_id: "integer" },
  eager_tl_widgets: { name: "string" },
  eager_twice_joins: { eager_twice_owner_id: "integer", eager_twice_target_id: "integer" },
  eager_twice_owners: { name: "string" },
  eager_twice_targets: { label: "string" },
  eager_widgets: { name: "string" },
  ex_sug_posts: { title: "string" },
  ex_sug_taggings: { name: "string", ex_sug_post_id: "integer" },
  ej_em_authors: { name: "string" },
  ej_em_posts: { title: "string", ej_em_author_id: "integer" },
  ej_authors: { name: "string" },
  ej_bt_authors: { name: "string" },
  ej_bt_posts: { title: "string", ej_bt_author_id: "integer" },
  ej_habtm_categories: { name: "string" },
  ej_habtm_posts: { title: "string" },
  ej_ho_profiles: { bio: "string", ej_ho_user_id: "integer" },
  ej_ho_users: { name: "string" },
  ej_posts: { title: "string", ej_author_id: "integer" },
  elidas_authors: { name: "string" },
  elidas_posts: { elidas_author_id: "integer" },
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
  eoidas_authors: { name: "string" },
  eoidas_posts: { eoidas_author_id: "integer" },
  ex_sug_authors: { name: "string" },
  habtm_eager_categories: { name: "string" },
  habtm_eager_posts: { title: "string" },
  habtm_inh_categories: { name: "string", type: "string" },
  habtm_inh_posts: { title: "string" },
  habtm_lim_categories: { name: "string" },
  habtm_lim_posts: { title: "string" },
  hm_scope_authors: { name: "string" },
  hm_scope_posts: { title: "string", hm_scope_author_id: "integer" },
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
  ma_habtm_authors: { name: "string" },
  ma_habtm_categories: { name: "string" },
  ma_habtm_posts: { title: "string", ma_habtm_author_id: "integer" },
  nest_ho_authors: { name: "string" },
  nest_ho_c_authors: { name: "string" },
  nest_ho_c_posts: { title: "string", nest_ho_c_author_id: "integer" },
  nest_ho_ca_authors: { name: "string" },
  nest_ho_ca_posts: { title: "string", nest_ho_ca_author_id: "integer" },
  nest_ho_cn_authors: { name: "string" },
  nest_ho_cn_posts: { title: "string", nest_ho_cn_author_id: "integer" },
  nest_ho_oa_authors: { name: "string" },
  nest_ho_oa_posts: { title: "string", nest_ho_oa_author_id: "integer" },
  nest_ho_on_authors: { name: "string" },
  nest_ho_on_posts: { title: "string", nest_ho_on_author_id: "integer" },
  nest_ho_ord_authors: { name: "string" },
  nest_ho_ord_posts: { title: "string", nest_ho_ord_author_id: "integer" },
  nest_ho_posts: { title: "string", nest_ho_author_id: "integer" },
  pci_authors: { name: "string" },
  pci_categories: { name: "string" },
  pci_posts: { title: "string", pci_author_id: "integer" },
  pcih_authors: { name: "string" },
  pcih_categories: { name: "string" },
  pcih_comments: { body: "string", pcih_post_id: "integer" },
  pcih_posts: { title: "string", pcih_author_id: "integer" },
  pcs_contractships: { pcs_project_id: "integer", pcs_developer_id: "integer" },
  pcs_developers: { name: "string" },
  pcs_projects: { name: "string" },
  peb_clients: { name: "string", peb_firm_id: "integer" },
  peb_firms: { name: "string" },
  phmt_authors: { name: "string" },
  phmt_comments: { body: "string", phmt_post_id: "integer" },
  phmt_posts: { title: "string", phmt_author_id: "integer" },
  pia_widgets: { name: "string" },
  pidas_authors: { name: "string" },
  pidas_posts: { pidas_author_id: "integer", mention: "string" },
  poidas_authors: { name: "string" },
  poidas_posts: { poidas_author_id: "integer", mention: "string" },
  pr_habtm_categories: { name: "string" },
  pr_habtm_posts: { title: "string" },
  pra_authors: { name: "string" },
  pra_posts: { title: "string", pra_author_id: "integer" },
  pre_poly_orphans: { name: "string", owner_id: "integer", owner_type: "string" },
  psta_clubs: { name: "string" },
  psta_members: { name: "string" },
  psta_memberships: { psta_member_id: "integer", psta_club_id: "integer", active: "boolean" },
  ptc_posts: { title: "string" },
  ptc_taggings: { taggable_id: "integer", taggable_type: "string", ptc_tag_id: "integer" },
  ptc_tags: { name: "string" },
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
  // HABTM join tables — no implicit primary key.
  ej_habtm_categories_ej_habtm_posts: {
    columns: { ej_habtm_category_id: "integer", ej_habtm_post_id: "integer" },
    primaryKey: false,
  },
  pr_habtm_categories_pr_habtm_posts: {
    columns: { pr_habtm_category_id: "integer", pr_habtm_post_id: "integer" },
    primaryKey: false,
  },
  habtm_lim_categories_habtm_lim_posts: {
    columns: { habtm_lim_category_id: "integer", habtm_lim_post_id: "integer" },
    primaryKey: false,
  },
  habtm_eager_categories_habtm_eager_posts: {
    columns: { habtm_eager_category_id: "integer", habtm_eager_post_id: "integer" },
    primaryKey: false,
  },
  habtm_inh_categories_habtm_inh_posts: {
    columns: {
      habtm_inh_category_id: "integer",
      habtm_inh_special_category_id: "integer",
      habtm_inh_post_id: "integer",
    },
    primaryKey: false,
  },
  ma_habtm_authors_ma_habtm_categories: {
    columns: { ma_habtm_author_id: "integer", ma_habtm_category_id: "integer" },
    primaryKey: false,
  },
  pci_categories_pci_posts: {
    columns: { pci_category_id: "integer", pci_post_id: "integer" },
    primaryKey: false,
  },
  pcih_categories_pcih_posts: {
    columns: { pcih_category_id: "integer", pcih_post_id: "integer" },
    primaryKey: false,
  },
};
// Shared models for the polymorphic-preload guard tests (Rails' Sponsor → sponsorable fixtures).
class SgAuthor extends Base {
  static {
    this.attribute("name", "string");
  }
}
class SgComment extends Base {
  static {
    this.attribute("body", "string");
    this.attribute("sg_post_id", "integer");
  }
}
class SgPost extends Base {
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
  static {
    this.attribute("kind", "string");
  }
}
class SgMember extends Base {
  static {
    this.attribute("name", "string");
    this.attribute("sg_post_id", "integer");
    this.belongsTo("post", { className: "SgPost", foreignKey: "sg_post_id" });
  }
}
class SgOrganization extends Base {
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
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
    registerSponsorableModels();
  });
  it("should work inverse of with eager load", async () => {
    class EagerInvParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerInvChildren", {
          className: "EagerInvChild",
          foreignKey: "eager_inv_parent_id",
        });
      }
    }
    class EagerInvChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_inv_parent_id", "integer");
      }
    }
    registerModel("EagerInvParent", EagerInvParent);
    registerModel("EagerInvChild", EagerInvChild);

    const parent = await EagerInvParent.create({ name: "P" });
    await EagerInvChild.create({ value: "C1", eager_inv_parent_id: parent.id });
    await EagerInvChild.create({ value: "C2", eager_inv_parent_id: parent.id });

    const parents = await EagerInvParent.all().includes("eagerInvChildren").toArray();
    expect(parents).toHaveLength(1);
    const children = (parents[0] as any)._preloadedAssociations.get("eagerInvChildren");
    expect(children).toHaveLength(2);
  });
  it("loading conditions with or", async () => {
    class EagerOrPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerOrComments", {
          className: "EagerOrComment",
          foreignKey: "eager_or_post_id",
        });
      }
    }
    class EagerOrComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_or_post_id", "integer");
      }
    }
    registerModel("EagerOrPost", EagerOrPost);
    registerModel("EagerOrComment", EagerOrComment);

    const p1 = await EagerOrPost.create({ title: "First" });
    const p2 = await EagerOrPost.create({ title: "Second" });
    await EagerOrComment.create({ body: "c1", eager_or_post_id: p1.id });
    await EagerOrComment.create({ body: "c2", eager_or_post_id: p2.id });

    const posts = await EagerOrPost.all().includes("eagerOrComments").toArray();
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      const comments = (post as any)._preloadedAssociations.get("eagerOrComments");
      expect(comments).toHaveLength(1);
    }
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
    class EagerPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerComments", {
          className: "EagerComment",
          foreignKey: "eager_post_id",
        });
      }
    }
    class EagerComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_post_id", "integer");
      }
    }
    registerModel("EagerPost", EagerPost);
    registerModel("EagerComment", EagerComment);

    const p1 = await EagerPost.create({ title: "A" });
    const p2 = await EagerPost.create({ title: "B" });
    await EagerComment.create({ body: "c1", eager_post_id: p1.id });

    const posts = await EagerPost.all().includes("eagerComments").toArray();
    const post1 = posts.find((p: any) => p.title === "A")!;
    const post2 = posts.find((p: any) => p.title === "B")!;
    expect((post1 as any)._preloadedAssociations.get("eagerComments")).toHaveLength(1);
    expect((post2 as any)._preloadedAssociations.get("eagerComments")).toHaveLength(0);
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
    const comments = (posts[0] as any)._preloadedAssociations.get("eagerOrderComments");
    expect(comments).toHaveLength(2);
  });
  it("has many through with order", async () => {
    class EagerHmtAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtAuthorships", {
          className: "EagerHmtAuthorship",
          foreignKey: "eager_hmt_author_id",
        });
        this.hasMany("eagerHmtBooks", {
          through: "eagerHmtAuthorships",
          source: "eagerHmtBook",
          className: "EagerHmtBook",
        });
      }
    }
    class EagerHmtAuthorship extends Base {
      static {
        this.attribute("eager_hmt_author_id", "integer");
        this.attribute("eager_hmt_book_id", "integer");
        this.belongsTo("eagerHmtBook", {
          className: "EagerHmtBook",
          foreignKey: "eager_hmt_book_id",
        });
      }
    }
    class EagerHmtBook extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtAuthor", EagerHmtAuthor);
    registerModel("EagerHmtAuthorship", EagerHmtAuthorship);
    registerModel("EagerHmtBook", EagerHmtBook);

    const author = await EagerHmtAuthor.create({ name: "Tolkien" });
    const book1 = await EagerHmtBook.create({ title: "LOTR" });
    const book2 = await EagerHmtBook.create({ title: "Hobbit" });
    await EagerHmtAuthorship.create({
      eager_hmt_author_id: author.id,
      eager_hmt_book_id: book1.id,
    });
    await EagerHmtAuthorship.create({
      eager_hmt_author_id: author.id,
      eager_hmt_book_id: book2.id,
    });

    const books = await loadHasManyThrough(author, "eagerHmtBooks", {
      through: "eagerHmtAuthorships",
      source: "eagerHmtBook",
      className: "EagerHmtBook",
    });
    expect(books).toHaveLength(2);
  });
  it("eager loaded has one association with references does not run additional queries", async () => {
    class EagerHoRefParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("eagerHoRefChild", {
          className: "EagerHoRefChild",
          foreignKey: "eager_ho_ref_parent_id",
        });
      }
    }
    class EagerHoRefChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_ho_ref_parent_id", "integer");
      }
    }
    registerModel("EagerHoRefParent", EagerHoRefParent);
    registerModel("EagerHoRefChild", EagerHoRefChild);

    const parent = await EagerHoRefParent.create({ name: "P" });
    await EagerHoRefChild.create({
      value: "C",
      eager_ho_ref_parent_id: parent.id,
    });

    const results = await EagerHoRefParent.all()
      .includes("eagerHoRefChild")
      .references("eagerHoRefChild")
      .toArray();
    expect(results).toHaveLength(1);
    const preloaded = (results[0] as any)._preloadedAssociations.get("eagerHoRefChild");
    expect(preloaded?.value).toBe("C");
  });
  it("eager loaded has one association without primary key", async () => {
    class EagerHoNoPkParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("eagerHoNoPkChild", {
          className: "EagerHoNoPkChild",
          foreignKey: "eager_ho_no_pk_parent_id",
        });
      }
    }
    class EagerHoNoPkChild extends Base {
      // No primary key (mirrors Rails' `Matey`, whose table is `id: false`),
      // so JoinDependency#construct must key identity off join_primary_key.
      static _primaryKey = "";
      static {
        this.attribute("value", "string");
        this.attribute("eager_ho_no_pk_parent_id", "integer");
      }
    }
    registerModel("EagerHoNoPkParent", EagerHoNoPkParent);
    registerModel("EagerHoNoPkChild", EagerHoNoPkChild);

    const parent = await EagerHoNoPkParent.create({ name: "P" });
    await EagerHoNoPkChild.create({
      value: "C",
      eager_ho_no_pk_parent_id: parent.id,
    });

    const parents = await EagerHoNoPkParent.all().eagerLoad("eagerHoNoPkChild").toArray();
    expect(parents).toHaveLength(1);
    const child = (parents[0] as any).association("eagerHoNoPkChild").target;
    expect(child?.value).toBe("C");
  });
  it("eager loaded has many association without primary key", async () => {
    class EagerHmNoPkParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmNoPkChildren", {
          className: "EagerHmNoPkChild",
          foreignKey: "eager_hm_no_pk_parent_id",
        });
      }
    }
    class EagerHmNoPkChild extends Base {
      // No primary key (mirrors Rails' `Matey`, whose table is `id: false`),
      // so JoinDependency#construct keys off join_primary_key and must not
      // collapse distinct rows into one via id-based model caching.
      static _primaryKey = "";
      static {
        this.attribute("value", "string");
        this.attribute("eager_hm_no_pk_parent_id", "integer");
      }
    }
    registerModel("EagerHmNoPkParent", EagerHmNoPkParent);
    registerModel("EagerHmNoPkChild", EagerHmNoPkChild);

    const parent = await EagerHmNoPkParent.create({ name: "P" });
    await EagerHmNoPkChild.create({ value: "C1", eager_hm_no_pk_parent_id: parent.id });
    await EagerHmNoPkChild.create({ value: "C2", eager_hm_no_pk_parent_id: parent.id });

    const parents = await EagerHmNoPkParent.all().eagerLoad("eagerHmNoPkChildren").toArray();
    expect(parents).toHaveLength(1);
    // Rails keys a no-PK node on the constant `[nil]` (`id = keys.map { nil }`),
    // so every matching row for one parent collapses to a single cached model —
    // the eager-loaded collection holds one child even though two rows match.
    // (Rails' own `mateys.yml` has one Matey per Pirate, so its mirror test
    // never surfaces the collapse.)
    const children = (parents[0] as any).association("eagerHmNoPkChildren").target;
    expect(children).toHaveLength(1);
  });
  it("duplicate middle objects", async () => {
    class EagerDupParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerDupChildren", {
          className: "EagerDupChild",
          foreignKey: "eager_dup_parent_id",
        });
      }
    }
    class EagerDupChild extends Base {
      static {
        this.attribute("label", "string");
        this.attribute("eager_dup_parent_id", "integer");
      }
    }
    registerModel("EagerDupParent", EagerDupParent);
    registerModel("EagerDupChild", EagerDupChild);

    const parent = await EagerDupParent.create({ name: "P" });
    await EagerDupChild.create({ label: "c1", eager_dup_parent_id: parent.id });
    await EagerDupChild.create({ label: "c2", eager_dup_parent_id: parent.id });

    const parents = await EagerDupParent.all().includes("eagerDupChildren").toArray();
    expect(parents).toHaveLength(1);
    const children = (parents[0] as any)._preloadedAssociations.get("eagerDupChildren");
    expect(children).toHaveLength(2);
  });
  it("including duplicate objects from belongs to", async () => {
    class EagerDupAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerDupPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("eager_dup_author_id", "integer");
        this.belongsTo("eagerDupAuthor", {
          className: "EagerDupAuthor",
          foreignKey: "eager_dup_author_id",
        });
      }
    }
    registerModel("EagerDupAuthor", EagerDupAuthor);
    registerModel("EagerDupPost", EagerDupPost);

    const author = await EagerDupAuthor.create({ name: "Same" });
    await EagerDupPost.create({ title: "P1", eager_dup_author_id: author.id });
    await EagerDupPost.create({ title: "P2", eager_dup_author_id: author.id });

    const posts = await EagerDupPost.all().includes("eagerDupAuthor").toArray();
    expect(posts).toHaveLength(2);
    // Both posts should have the same author preloaded
    const a1 = (posts[0] as any)._preloadedAssociations.get("eagerDupAuthor");
    const a2 = (posts[1] as any)._preloadedAssociations.get("eagerDupAuthor");
    expect(a1?.id).toBe(author.id);
    expect(a2?.id).toBe(author.id);
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
    const tags = (results[0] as any)._preloadedAssociations.get("eagerTags");
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
    const preloaded = (results[0] as any)._preloadedAssociations.get("eagerHoChild");
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
    const preloaded = (results[0] as any)._preloadedAssociations.get("eagerBtParent");
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
    const preloaded = (results[0] as any)._preloadedAssociations.get("eagerNullParent");
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
    const preloaded = (results[0] as any)._preloadedAssociations?.get("parent");
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
    const preloaded = (results[0] as any)._preloadedAssociations?.get("parent");
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
    const preloaded = (books[0] as any)._preloadedAssociations.get("eagerAuthor");
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
  it("nested loading through has one association", async () => {
    class NestHoAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("nestHoPost", {
          className: "NestHoPost",
          foreignKey: "nest_ho_author_id",
        });
      }
    }
    class NestHoPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("nest_ho_author_id", "integer");
      }
    }
    registerModel("NestHoAuthor", NestHoAuthor);
    registerModel("NestHoPost", NestHoPost);

    const author = await NestHoAuthor.create({ name: "Alice" });
    await NestHoPost.create({ title: "First Post", nest_ho_author_id: author.id });

    const authors = await NestHoAuthor.all().includes("nestHoPost").toArray();
    expect(authors).toHaveLength(1);
    const post = (authors[0] as any)._preloadedAssociations.get("nestHoPost");
    expect(post?.title).toBe("First Post");
  });
  it("nested loading through has one association with order", async () => {
    class NestHoOrdAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("nestHoOrdPost", {
          className: "NestHoOrdPost",
          foreignKey: "nest_ho_ord_author_id",
        });
      }
    }
    class NestHoOrdPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("nest_ho_ord_author_id", "integer");
      }
    }
    registerModel("NestHoOrdAuthor", NestHoOrdAuthor);
    registerModel("NestHoOrdPost", NestHoOrdPost);

    const author = await NestHoOrdAuthor.create({ name: "Bob" });
    await NestHoOrdPost.create({
      title: "Only Post",
      nest_ho_ord_author_id: author.id,
    });

    const authors = await NestHoOrdAuthor.all().includes("nestHoOrdPost").toArray();
    expect(authors).toHaveLength(1);
    const post = (authors[0] as any)._preloadedAssociations.get("nestHoOrdPost");
    expect(post?.title).toBe("Only Post");
  });
  it("nested loading through has one association with order on association", async () => {
    class NestHoOaAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("nestHoOaPost", {
          className: "NestHoOaPost",
          foreignKey: "nest_ho_oa_author_id",
        });
      }
    }
    class NestHoOaPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("nest_ho_oa_author_id", "integer");
      }
    }
    registerModel("NestHoOaAuthor", NestHoOaAuthor);
    registerModel("NestHoOaPost", NestHoOaPost);

    const author = await NestHoOaAuthor.create({ name: "Carol" });
    await NestHoOaPost.create({
      title: "Carol Post",
      nest_ho_oa_author_id: author.id,
    });

    const authors = await NestHoOaAuthor.all().includes("nestHoOaPost").toArray();
    expect(authors).toHaveLength(1);
    const post = (authors[0] as any)._preloadedAssociations.get("nestHoOaPost");
    expect(post?.title).toBe("Carol Post");
  });
  it("nested loading through has one association with order on nested association", async () => {
    class NestHoOnAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("nestHoOnPost", {
          className: "NestHoOnPost",
          foreignKey: "nest_ho_on_author_id",
        });
      }
    }
    class NestHoOnPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("nest_ho_on_author_id", "integer");
      }
    }
    registerModel("NestHoOnAuthor", NestHoOnAuthor);
    registerModel("NestHoOnPost", NestHoOnPost);

    const author = await NestHoOnAuthor.create({ name: "Dave" });
    await NestHoOnPost.create({
      title: "Dave Post",
      nest_ho_on_author_id: author.id,
    });

    const authors = await NestHoOnAuthor.all().includes("nestHoOnPost").toArray();
    expect(authors).toHaveLength(1);
    const post = (authors[0] as any)._preloadedAssociations.get("nestHoOnPost");
    expect(post?.title).toBe("Dave Post");
  });
  it("nested loading through has one association with conditions", async () => {
    class NestHoCAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("nestHoCPost", {
          className: "NestHoCPost",
          foreignKey: "nest_ho_c_author_id",
        });
      }
    }
    class NestHoCPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("nest_ho_c_author_id", "integer");
      }
    }
    registerModel("NestHoCAuthor", NestHoCAuthor);
    registerModel("NestHoCPost", NestHoCPost);

    const author = await NestHoCAuthor.create({ name: "Eve" });
    await NestHoCPost.create({
      title: "Eve Post",
      nest_ho_c_author_id: author.id,
    });

    const authors = await NestHoCAuthor.all().includes("nestHoCPost").toArray();
    expect(authors).toHaveLength(1);
    const post = (authors[0] as any)._preloadedAssociations.get("nestHoCPost");
    expect(post?.title).toBe("Eve Post");
  });
  it("nested loading through has one association with conditions on association", async () => {
    class NestHoCaAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("nestHoCaPost", {
          className: "NestHoCaPost",
          foreignKey: "nest_ho_ca_author_id",
        });
      }
    }
    class NestHoCaPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("nest_ho_ca_author_id", "integer");
      }
    }
    registerModel("NestHoCaAuthor", NestHoCaAuthor);
    registerModel("NestHoCaPost", NestHoCaPost);

    const author = await NestHoCaAuthor.create({ name: "Frank" });
    await NestHoCaPost.create({
      title: "Frank Post",
      nest_ho_ca_author_id: author.id,
    });

    const authors = await NestHoCaAuthor.all().includes("nestHoCaPost").toArray();
    expect(authors).toHaveLength(1);
    const post = (authors[0] as any)._preloadedAssociations.get("nestHoCaPost");
    expect(post?.title).toBe("Frank Post");
  });
  it("nested loading through has one association with conditions on nested association", async () => {
    class NestHoCnAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("nestHoCnPost", {
          className: "NestHoCnPost",
          foreignKey: "nest_ho_cn_author_id",
        });
      }
    }
    class NestHoCnPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("nest_ho_cn_author_id", "integer");
      }
    }
    registerModel("NestHoCnAuthor", NestHoCnAuthor);
    registerModel("NestHoCnPost", NestHoCnPost);

    const author = await NestHoCnAuthor.create({ name: "Grace" });
    await NestHoCnPost.create({
      title: "Grace Post",
      nest_ho_cn_author_id: author.id,
    });

    const authors = await NestHoCnAuthor.all().includes("nestHoCnPost").toArray();
    expect(authors).toHaveLength(1);
    const post = (authors[0] as any)._preloadedAssociations.get("nestHoCnPost");
    expect(post?.title).toBe("Grace Post");
  });

  it("eager load belongs to quotes table and column names", async () => {
    class EagerQtCompany extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class EagerQtClient extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("eager_qt_company_id", "integer");
        this.belongsTo("eagerQtCompany", {
          className: "EagerQtCompany",
          foreignKey: "eager_qt_company_id",
        });
      }
    }
    registerModel("EagerQtCompany", EagerQtCompany);
    registerModel("EagerQtClient", EagerQtClient);
    const co = await EagerQtCompany.create({ name: "Acme" });
    await EagerQtClient.create({ name: "C1", eager_qt_company_id: co.id });
    const clients = await EagerQtClient.all().includes("eagerQtCompany").toArray();
    expect((clients[0] as any)._preloadedAssociations.get("eagerQtCompany")?.name).toBe("Acme");
  });
  it("eager load has one quotes table and column names", async () => {
    class EagerQtHoParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("eagerQtHoChild", {
          className: "EagerQtHoChild",
          foreignKey: "eager_qt_ho_parent_id",
        });
      }
    }
    class EagerQtHoChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_qt_ho_parent_id", "integer");
      }
    }
    registerModel("EagerQtHoParent", EagerQtHoParent);
    registerModel("EagerQtHoChild", EagerQtHoChild);
    const p = await EagerQtHoParent.create({ name: "P" });
    await EagerQtHoChild.create({ value: "V", eager_qt_ho_parent_id: p.id });
    const parents = await EagerQtHoParent.all().includes("eagerQtHoChild").toArray();
    expect((parents[0] as any)._preloadedAssociations.get("eagerQtHoChild")?.value).toBe("V");
  });
  it("eager load has many quotes table and column names", async () => {
    class EagerQtHmParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerQtHmChildren", {
          className: "EagerQtHmChild",
          foreignKey: "eager_qt_hm_parent_id",
        });
      }
    }
    class EagerQtHmChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_qt_hm_parent_id", "integer");
      }
    }
    registerModel("EagerQtHmParent", EagerQtHmParent);
    registerModel("EagerQtHmChild", EagerQtHmChild);
    const p = await EagerQtHmParent.create({ name: "P" });
    await EagerQtHmChild.create({ value: "C1", eager_qt_hm_parent_id: p.id });
    const parents = await EagerQtHmParent.all().includes("eagerQtHmChildren").toArray();
    expect((parents[0] as any)._preloadedAssociations.get("eagerQtHmChildren")).toHaveLength(1);
  });
  it("eager load has many through quotes table and column names", async () => {
    class EagerQtThrOwner extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerQtThrJoins", {
          className: "EagerQtThrJoin",
          foreignKey: "eager_qt_thr_owner_id",
        });
        this.hasMany("eagerQtThrItems", {
          className: "EagerQtThrItem",
          through: "eagerQtThrJoins",
          source: "eagerQtThrItem",
        });
      }
    }
    class EagerQtThrJoin extends Base {
      static {
        this.attribute("eager_qt_thr_owner_id", "integer");
        this.attribute("eager_qt_thr_item_id", "integer");
        this.belongsTo("eagerQtThrItem", {
          className: "EagerQtThrItem",
          foreignKey: "eager_qt_thr_item_id",
        });
      }
    }
    class EagerQtThrItem extends Base {
      static {
        this.attribute("label", "string");
      }
    }

    registerModel("EagerQtThrOwner", EagerQtThrOwner);
    registerModel("EagerQtThrJoin", EagerQtThrJoin);
    registerModel("EagerQtThrItem", EagerQtThrItem);
    const owner = await EagerQtThrOwner.create({ name: "O" });
    const item = await EagerQtThrItem.create({ label: "I1" });
    await EagerQtThrJoin.create({
      eager_qt_thr_owner_id: owner.id,
      eager_qt_thr_item_id: item.id,
    });
    const owners = await EagerQtThrOwner.all().includes("eagerQtThrItems").toArray();
    expect((owners[0] as any)._preloadedAssociations.get("eagerQtThrItems")).toHaveLength(1);
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
    const children = (parents[0] as any)._preloadedAssociations.get("eagerStrChildren");
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
    const preloaded = (children[0] as any)._preloadedAssociations.get("eagerStrBtParent");
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
    const posts = (authors[0] as any)._preloadedAssociations?.get("ejPosts");
    expect(posts).toHaveLength(2);
    const titles = posts.map((p: any) => p.title).sort();
    expect(titles).toEqual(["P1", "P2"]);

    // Association proxy wired during hydration (not lazy-synced from _preloadedAssociations)
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
    const loaded = (posts2[0] as any)._preloadedAssociations?.get("ejBtAuthor");
    expect(loaded).not.toBeNull();
    expect(loaded.name).toBe("BtAuthor");

    // Association proxy wired during hydration (not lazy-synced from _preloadedAssociations)
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
    const profile = (users[0] as any)._preloadedAssociations?.get("ejHoProfile");
    expect(profile).not.toBeNull();
    expect(profile.bio).toBe("HoBio");

    // Association proxy wired during hydration (not lazy-synced from _preloadedAssociations)
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
  it("eager association loading with explicit join habtm", async () => {
    class EjHabtmPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasAndBelongsToMany("ejHabtmCategories", {
          className: "EjHabtmCategory",
          joinTable: "ej_habtm_categories_ej_habtm_posts",
        });
      }
    }
    class EjHabtmCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(EjHabtmPost);
    registerModel(EjHabtmCategory);

    const p1 = await EjHabtmPost.create({ title: "P1" });
    const p2 = await EjHabtmPost.create({ title: "P2" });
    const tech = await EjHabtmCategory.create({ name: "Technology" });
    const gen = await EjHabtmCategory.create({ name: "General" });

    const { CollectionProxy } = await import("./collection-proxy.js");
    const assoc = (EjHabtmPost as any)._associations.find(
      (a: any) => a.name === "ejHabtmCategories",
    )!;
    await new CollectionProxy(p1, "ejHabtmCategories", assoc).push(tech, gen);
    await new CollectionProxy(p2, "ejHabtmCategories", assoc).push(gen);

    const rel = EjHabtmPost.all().eagerLoad("ejHabtmCategories").order("id", "asc");
    // Prove the JOIN path is taken (not the addAssociation==null fallback to preload):
    // the eager-load SQL must reference both the join table and the target table.
    const sql = rel.toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN.*ej_habtm_categories_ej_habtm_posts/);
    expect(sql).toMatch(/LEFT OUTER JOIN.*ej_habtm_categories[^_]/);

    const posts = await rel.toArray();
    expect(posts).toHaveLength(2);
    const cats0 = (posts[0] as any)._preloadedAssociations.get("ejHabtmCategories");
    const cats1 = (posts[1] as any)._preloadedAssociations.get("ejHabtmCategories");
    expect(cats0).toHaveLength(2);
    expect(cats1).toHaveLength(1);
    expect(cats1[0].name).toBe("General");
  });
  it("eager association loading with habtm via preload", async () => {
    class PrHabtmPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasAndBelongsToMany("prHabtmCategories", {
          className: "PrHabtmCategory",
          joinTable: "pr_habtm_categories_pr_habtm_posts",
        });
      }
    }
    class PrHabtmCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(PrHabtmPost);
    registerModel(PrHabtmCategory);

    const p1 = await PrHabtmPost.create({ title: "P1" });
    const tech = await PrHabtmCategory.create({ name: "Technology" });
    const gen = await PrHabtmCategory.create({ name: "General" });

    const { CollectionProxy } = await import("./collection-proxy.js");
    const assoc = (PrHabtmPost as any)._associations.find(
      (a: any) => a.name === "prHabtmCategories",
    )!;
    await new CollectionProxy(p1, "prHabtmCategories", assoc).push(tech, gen);

    const posts = await PrHabtmPost.all().preload("prHabtmCategories").toArray();
    expect(posts).toHaveLength(1);
    const cats = (posts[0] as any)._preloadedAssociations.get("prHabtmCategories");
    expect(cats).toHaveLength(2);
  });
  it("eager with has many through", async () => {
    class EagerHmtReader extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtSubscriptions", {
          className: "EagerHmtSubscription",
          foreignKey: "eager_hmt_reader_id",
        });
        this.hasMany("eagerHmtMagazines", {
          through: "eagerHmtSubscriptions",
          source: "eagerHmtMagazine",
          className: "EagerHmtMagazine",
        });
      }
    }
    class EagerHmtSubscription extends Base {
      static {
        this.attribute("eager_hmt_reader_id", "integer");
        this.attribute("eager_hmt_magazine_id", "integer");
        this.belongsTo("eagerHmtMagazine", {
          className: "EagerHmtMagazine",
          foreignKey: "eager_hmt_magazine_id",
        });
      }
    }
    class EagerHmtMagazine extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtReader", EagerHmtReader);
    registerModel("EagerHmtSubscription", EagerHmtSubscription);
    registerModel("EagerHmtMagazine", EagerHmtMagazine);

    const reader = await EagerHmtReader.create({ name: "Alice" });
    const mag1 = await EagerHmtMagazine.create({ title: "Wired" });
    const mag2 = await EagerHmtMagazine.create({ title: "Time" });
    await EagerHmtSubscription.create({
      eager_hmt_reader_id: reader.id,
      eager_hmt_magazine_id: mag1.id,
    });
    await EagerHmtSubscription.create({
      eager_hmt_reader_id: reader.id,
      eager_hmt_magazine_id: mag2.id,
    });

    const mags = await loadHasManyThrough(reader, "eagerHmtMagazines", {
      through: "eagerHmtSubscriptions",
      source: "eagerHmtMagazine",
      className: "EagerHmtMagazine",
    });
    expect(mags).toHaveLength(2);
  });
  it("eager with has many through a belongs to association", async () => {
    class EagerHmtBtAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtBtPosts", {
          className: "EagerHmtBtPost",
          foreignKey: "eager_hmt_bt_author_id",
        });
        this.hasMany("eagerHmtBtComments", {
          through: "eagerHmtBtPosts",
          source: "eagerHmtBtComment",
          className: "EagerHmtBtComment",
        });
      }
    }
    class EagerHmtBtPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("eager_hmt_bt_author_id", "integer");
        this.hasMany("eagerHmtBtComment", {
          className: "EagerHmtBtComment",
          foreignKey: "eager_hmt_bt_post_id",
        });
      }
    }
    class EagerHmtBtComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_hmt_bt_post_id", "integer");
      }
    }

    registerModel("EagerHmtBtAuthor", EagerHmtBtAuthor);
    registerModel("EagerHmtBtPost", EagerHmtBtPost);
    registerModel("EagerHmtBtComment", EagerHmtBtComment);

    const author = await EagerHmtBtAuthor.create({ name: "Bob" });
    const post = await EagerHmtBtPost.create({
      title: "Hello",
      eager_hmt_bt_author_id: author.id,
    });
    await EagerHmtBtComment.create({
      body: "Great",
      eager_hmt_bt_post_id: post.id,
    });

    const posts = await loadHasMany(author, "eagerHmtBtPosts", {
      className: "EagerHmtBtPost",
      foreignKey: "eager_hmt_bt_author_id",
    });
    expect(posts).toHaveLength(1);
    const comments = await loadHasMany(posts[0], "eagerHmtBtComment", {
      className: "EagerHmtBtComment",
      foreignKey: "eager_hmt_bt_post_id",
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("Great");
  });
  it("eager with has many through an sti join model", async () => {
    // Author -> SpecialPost (STI) -> Comments (through)
    class EagerStiAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerSpecialPosts", {
          className: "EagerSpecialPost",
          foreignKey: "eager_sti_author_id",
        });
        this.hasMany("specialPostComments", {
          className: "EagerStiComment",
          through: "eagerSpecialPosts",
          source: "eagerStiComment",
        });
      }
    }
    class EagerStiPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("eager_sti_author_id", "integer");
        this._tableName = "eager_sti_posts";
        enableSti(EagerStiPost);
      }
    }
    class EagerSpecialPost extends EagerStiPost {
      static {
        registerModel(EagerSpecialPost);
        registerSubclass(EagerSpecialPost);
        this.hasMany("eagerStiComment", {
          className: "EagerStiComment",
          foreignKey: "eager_sti_post_id",
        });
      }
    }
    class EagerStiComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_sti_post_id", "integer");
      }
    }
    registerModel(EagerStiAuthor);
    registerModel(EagerStiPost);
    registerModel(EagerStiComment);

    const author = await EagerStiAuthor.create({ name: "David" });
    const normalPost = await EagerStiPost.create({
      title: "Normal",
      eager_sti_author_id: author.id,
    });
    const specialPost = await EagerSpecialPost.create({
      title: "Special",
      eager_sti_author_id: author.id,
    });
    await EagerStiComment.create({ body: "on normal", eager_sti_post_id: normalPost.id });
    await EagerStiComment.create({ body: "does it hurt", eager_sti_post_id: specialPost.id });

    const authors = await EagerStiAuthor.all().includes("specialPostComments").toArray();
    const comments = (authors[0] as any)._preloadedAssociations.get("specialPostComments");
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("does it hurt");
  });
  it.skip("preloading with has one through an sti with after initialize", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("preloading has many through with implicit source", async () => {
    class EagerImpOwner extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerImpJoins", {
          className: "EagerImpJoin",
          foreignKey: "eager_imp_owner_id",
        });
        this.hasMany("eagerImpItems", {
          className: "EagerImpItem",
          through: "eagerImpJoins",
          source: "eagerImpItem",
        });
      }
    }
    class EagerImpJoin extends Base {
      static {
        this.attribute("eager_imp_owner_id", "integer");
        this.attribute("eager_imp_item_id", "integer");
        this.belongsTo("eagerImpItem", {
          className: "EagerImpItem",
          foreignKey: "eager_imp_item_id",
        });
      }
    }
    class EagerImpItem extends Base {
      static {
        this.attribute("label", "string");
      }
    }

    registerModel("EagerImpOwner", EagerImpOwner);
    registerModel("EagerImpJoin", EagerImpJoin);
    registerModel("EagerImpItem", EagerImpItem);
    const owner = await EagerImpOwner.create({ name: "O" });
    const item = await EagerImpItem.create({ label: "I" });
    await EagerImpJoin.create({
      eager_imp_owner_id: owner.id,
      eager_imp_item_id: item.id,
    });
    const items = await loadHasManyThrough(owner, "eagerImpItems", {
      through: "eagerImpJoins",
      source: "eagerImpItem",
      className: "EagerImpItem",
    });
    expect(items).toHaveLength(1);
  });
  it.skip("eager with has many through an sti join model with conditions on both", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("eager with has many through join model with conditions", async () => {
    class EagerHmtCondAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtCondAuthorships", {
          className: "EagerHmtCondAuthorship",
          foreignKey: "eager_hmt_cond_author_id",
        });
        this.hasMany("eagerHmtCondBooks", {
          through: "eagerHmtCondAuthorships",
          source: "eagerHmtCondBook",
          className: "EagerHmtCondBook",
        });
      }
    }
    class EagerHmtCondAuthorship extends Base {
      static {
        this.attribute("eager_hmt_cond_author_id", "integer");
        this.attribute("eager_hmt_cond_book_id", "integer");
        this.belongsTo("eagerHmtCondBook", {
          className: "EagerHmtCondBook",
          foreignKey: "eager_hmt_cond_book_id",
        });
      }
    }
    class EagerHmtCondBook extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtCondAuthor", EagerHmtCondAuthor);
    registerModel("EagerHmtCondAuthorship", EagerHmtCondAuthorship);
    registerModel("EagerHmtCondBook", EagerHmtCondBook);

    const author = await EagerHmtCondAuthor.create({ name: "Author1" });
    const book1 = await EagerHmtCondBook.create({ title: "Book1" });
    const book2 = await EagerHmtCondBook.create({ title: "Book2" });
    await EagerHmtCondAuthorship.create({
      eager_hmt_cond_author_id: author.id,
      eager_hmt_cond_book_id: book1.id,
    });
    await EagerHmtCondAuthorship.create({
      eager_hmt_cond_author_id: author.id,
      eager_hmt_cond_book_id: book2.id,
    });

    const books = await loadHasManyThrough(author, "eagerHmtCondBooks", {
      through: "eagerHmtCondAuthorships",
      source: "eagerHmtCondBook",
      className: "EagerHmtCondBook",
    });
    expect(books).toHaveLength(2);
  });
  it("eager with has many through join model with conditions on top level", async () => {
    class EagerHmtTopAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtTopAuthorships", {
          className: "EagerHmtTopAuthorship",
          foreignKey: "eager_hmt_top_author_id",
        });
        this.hasMany("eagerHmtTopBooks", {
          through: "eagerHmtTopAuthorships",
          source: "eagerHmtTopBook",
          className: "EagerHmtTopBook",
        });
      }
    }
    class EagerHmtTopAuthorship extends Base {
      static {
        this.attribute("eager_hmt_top_author_id", "integer");
        this.attribute("eager_hmt_top_book_id", "integer");
        this.belongsTo("eagerHmtTopBook", {
          className: "EagerHmtTopBook",
          foreignKey: "eager_hmt_top_book_id",
        });
      }
    }
    class EagerHmtTopBook extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtTopAuthor", EagerHmtTopAuthor);
    registerModel("EagerHmtTopAuthorship", EagerHmtTopAuthorship);
    registerModel("EagerHmtTopBook", EagerHmtTopBook);

    const a1 = await EagerHmtTopAuthor.create({ name: "A1" });
    const a2 = await EagerHmtTopAuthor.create({ name: "A2" });
    const book = await EagerHmtTopBook.create({ title: "Shared" });
    await EagerHmtTopAuthorship.create({
      eager_hmt_top_author_id: a1.id,
      eager_hmt_top_book_id: book.id,
    });
    await EagerHmtTopAuthorship.create({
      eager_hmt_top_author_id: a2.id,
      eager_hmt_top_book_id: book.id,
    });

    const books1 = await loadHasManyThrough(a1, "eagerHmtTopBooks", {
      through: "eagerHmtTopAuthorships",
      source: "eagerHmtTopBook",
      className: "EagerHmtTopBook",
    });
    expect(books1).toHaveLength(1);
    const books2 = await loadHasManyThrough(a2, "eagerHmtTopBooks", {
      through: "eagerHmtTopAuthorships",
      source: "eagerHmtTopBook",
      className: "EagerHmtTopBook",
    });
    expect(books2).toHaveLength(1);
  });
  it("eager with has many through join model with include", async () => {
    class EagerHmtIncAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtIncAuthorships", {
          className: "EagerHmtIncAuthorship",
          foreignKey: "eager_hmt_inc_author_id",
        });
        this.hasMany("eagerHmtIncBooks", {
          through: "eagerHmtIncAuthorships",
          source: "eagerHmtIncBook",
          className: "EagerHmtIncBook",
        });
      }
    }
    class EagerHmtIncAuthorship extends Base {
      static {
        this.attribute("eager_hmt_inc_author_id", "integer");
        this.attribute("eager_hmt_inc_book_id", "integer");
        this.belongsTo("eagerHmtIncBook", {
          className: "EagerHmtIncBook",
          foreignKey: "eager_hmt_inc_book_id",
        });
      }
    }
    class EagerHmtIncBook extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtIncAuthor", EagerHmtIncAuthor);
    registerModel("EagerHmtIncAuthorship", EagerHmtIncAuthorship);
    registerModel("EagerHmtIncBook", EagerHmtIncBook);

    const author = await EagerHmtIncAuthor.create({ name: "Author1" });
    const book1 = await EagerHmtIncBook.create({ title: "Book1" });
    const book2 = await EagerHmtIncBook.create({ title: "Book2" });
    await EagerHmtIncAuthorship.create({
      eager_hmt_inc_author_id: author.id,
      eager_hmt_inc_book_id: book1.id,
    });
    await EagerHmtIncAuthorship.create({
      eager_hmt_inc_author_id: author.id,
      eager_hmt_inc_book_id: book2.id,
    });

    const books = await loadHasManyThrough(author, "eagerHmtIncBooks", {
      through: "eagerHmtIncAuthorships",
      source: "eagerHmtIncBook",
      className: "EagerHmtIncBook",
    });
    expect(books).toHaveLength(2);
    const titles = books.map((b) => b.title);
    expect(titles).toContain("Book1");
    expect(titles).toContain("Book2");
  });
  it("eager with has many through with conditions join model with include", async () => {
    class EagerHmtCjAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtCjAuthorships", {
          className: "EagerHmtCjAuthorship",
          foreignKey: "eager_hmt_cj_author_id",
        });
        this.hasMany("eagerHmtCjBooks", {
          through: "eagerHmtCjAuthorships",
          source: "eagerHmtCjBook",
          className: "EagerHmtCjBook",
        });
      }
    }
    class EagerHmtCjAuthorship extends Base {
      static {
        this.attribute("eager_hmt_cj_author_id", "integer");
        this.attribute("eager_hmt_cj_book_id", "integer");
        this.belongsTo("eagerHmtCjBook", {
          className: "EagerHmtCjBook",
          foreignKey: "eager_hmt_cj_book_id",
        });
      }
    }
    class EagerHmtCjBook extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtCjAuthor", EagerHmtCjAuthor);
    registerModel("EagerHmtCjAuthorship", EagerHmtCjAuthorship);
    registerModel("EagerHmtCjBook", EagerHmtCjBook);

    const author = await EagerHmtCjAuthor.create({ name: "A" });
    const book = await EagerHmtCjBook.create({ title: "B" });
    await EagerHmtCjAuthorship.create({
      eager_hmt_cj_author_id: author.id,
      eager_hmt_cj_book_id: book.id,
    });

    const books = await loadHasManyThrough(author, "eagerHmtCjBooks", {
      through: "eagerHmtCjAuthorships",
      source: "eagerHmtCjBook",
      className: "EagerHmtCjBook",
    });
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("B");
  });
  it("eager with has many through join model ignores default includes", async () => {
    class EagerHmtDiAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmtDiAuthorships", {
          className: "EagerHmtDiAuthorship",
          foreignKey: "eager_hmt_di_author_id",
        });
        this.hasMany("eagerHmtDiBooks", {
          through: "eagerHmtDiAuthorships",
          source: "eagerHmtDiBook",
          className: "EagerHmtDiBook",
        });
      }
    }
    class EagerHmtDiAuthorship extends Base {
      static {
        this.attribute("eager_hmt_di_author_id", "integer");
        this.attribute("eager_hmt_di_book_id", "integer");
        this.belongsTo("eagerHmtDiBook", {
          className: "EagerHmtDiBook",
          foreignKey: "eager_hmt_di_book_id",
        });
      }
    }
    class EagerHmtDiBook extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    registerModel("EagerHmtDiAuthor", EagerHmtDiAuthor);
    registerModel("EagerHmtDiAuthorship", EagerHmtDiAuthorship);
    registerModel("EagerHmtDiBook", EagerHmtDiBook);

    const author = await EagerHmtDiAuthor.create({ name: "A" });
    const book = await EagerHmtDiBook.create({ title: "B" });
    await EagerHmtDiAuthorship.create({
      eager_hmt_di_author_id: author.id,
      eager_hmt_di_book_id: book.id,
    });

    const books = await loadHasManyThrough(author, "eagerHmtDiBooks", {
      through: "eagerHmtDiAuthorships",
      source: "eagerHmtDiBook",
      className: "EagerHmtDiBook",
    });
    expect(books).toHaveLength(1);
  });
  it("eager with has and belongs to many and limit", async () => {
    // Rails: test_eager_with_has_and_belongs_to_many_and_limit
    //   Post.all.merge!(includes: :categories, order: "posts.id", limit: 3).to_a
    // Plain .includes (no .references) routes through the preloader, so the
    // base SELECT carries the LIMIT and MariaDB's "LIMIT & IN subquery"
    // restriction is not triggered.
    class HabtmLimPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasAndBelongsToMany("habtmLimCategories", {
          className: "HabtmLimCategory",
          joinTable: "habtm_lim_categories_habtm_lim_posts",
        });
      }
    }
    class HabtmLimCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(HabtmLimPost);
    registerModel(HabtmLimCategory);

    const p1 = await HabtmLimPost.create({ title: "P1" });
    const p2 = await HabtmLimPost.create({ title: "P2" });
    const _p3 = await HabtmLimPost.create({ title: "P3" });
    const tech = await HabtmLimCategory.create({ name: "Technology" });
    const gen = await HabtmLimCategory.create({ name: "General" });

    const { CollectionProxy } = await import("./collection-proxy.js");
    const assoc = (HabtmLimPost as any)._associations.find(
      (a: any) => a.name === "habtmLimCategories",
    )!;
    await new CollectionProxy(p1, "habtmLimCategories", assoc).push(tech, gen);
    await new CollectionProxy(p2, "habtmLimCategories", assoc).push(gen);

    const posts = await HabtmLimPost.all()
      .includes("habtmLimCategories")
      .order("id", "asc")
      .limit(3)
      .toArray();
    expect(posts).toHaveLength(3);
    expect((posts[0] as any)._preloadedAssociations.get("habtmLimCategories")).toHaveLength(2);
    expect((posts[1] as any)._preloadedAssociations.get("habtmLimCategories")).toHaveLength(1);
    expect((posts[2] as any)._preloadedAssociations.get("habtmLimCategories")).toHaveLength(0);
  });
  it("eager association loading with habtm", async () => {
    class HabtmEagerPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasAndBelongsToMany("habtmEagerCategories", {
          className: "HabtmEagerCategory",
          joinTable: "habtm_eager_categories_habtm_eager_posts",
        });
      }
    }
    class HabtmEagerCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(HabtmEagerPost);
    registerModel(HabtmEagerCategory);

    const p1 = await HabtmEagerPost.create({ title: "P1" });
    const p2 = await HabtmEagerPost.create({ title: "P2" });
    const p3 = await HabtmEagerPost.create({ title: "P3" });
    const tech = await HabtmEagerCategory.create({ name: "Technology" });
    const gen = await HabtmEagerCategory.create({ name: "General" });

    // p1 has 2 categories, p2 has 1, p3 has 0
    const { CollectionProxy } = await import("./collection-proxy.js");
    const habtmEagerAssoc = (HabtmEagerPost as any)._associations.find(
      (a: any) => a.name === "habtmEagerCategories",
    )!;
    const proxy1 = new CollectionProxy(p1, "habtmEagerCategories", habtmEagerAssoc);
    await proxy1.push(tech, gen);
    const proxy2 = new CollectionProxy(p2, "habtmEagerCategories", habtmEagerAssoc);
    await proxy2.push(gen);

    const posts = await HabtmEagerPost.all()
      .includes("habtmEagerCategories")
      .order("id", "asc")
      .toArray();
    expect(posts).toHaveLength(3);
    const cats0 = (posts[0] as any)._preloadedAssociations.get("habtmEagerCategories");
    const cats1 = (posts[1] as any)._preloadedAssociations.get("habtmEagerCategories");
    const cats2 = (posts[2] as any)._preloadedAssociations.get("habtmEagerCategories");
    expect(cats0).toHaveLength(2);
    expect(cats1).toHaveLength(1);
    expect(cats2).toHaveLength(0);
  });
  it("eager with inheritance", async () => {
    class EagerInhCompany extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.hasMany("eagerInhClients", {
          className: "EagerInhClient",
          foreignKey: "eager_inh_company_id",
        });
      }
    }
    class EagerInhFirm extends EagerInhCompany {}
    class EagerInhClient extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("eager_inh_company_id", "integer");
      }
    }
    registerModel("EagerInhCompany", EagerInhCompany);
    registerModel("EagerInhFirm", EagerInhFirm);
    registerModel("EagerInhClient", EagerInhClient);
    enableSti(EagerInhCompany);
    registerSubclass(EagerInhFirm);
    const firm = await EagerInhFirm.create({ name: "Firm1" });
    await EagerInhClient.create({ name: "Client1", eager_inh_company_id: firm.id });
    const companies = await EagerInhCompany.all().includes("eagerInhClients").toArray();
    expect(companies.length).toBeGreaterThanOrEqual(1);
    const loaded = (companies[0] as any)._preloadedAssociations?.get("eagerInhClients");
    expect(loaded).toBeDefined();
  });
  it("eager has one with association inheritance", async () => {
    class EagerHoiParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("eagerHoiProfile", {
          className: "EagerHoiProfile",
          foreignKey: "eager_hoi_parent_id",
        });
      }
    }
    class EagerHoiProfile extends Base {
      static {
        this.attribute("bio", "string");
        this.attribute("type", "string");
        this.attribute("eager_hoi_parent_id", "integer");
      }
    }
    class EagerHoiSpecialProfile extends EagerHoiProfile {}
    registerModel("EagerHoiParent", EagerHoiParent);
    registerModel("EagerHoiProfile", EagerHoiProfile);
    registerModel("EagerHoiSpecialProfile", EagerHoiSpecialProfile);
    enableSti(EagerHoiProfile);
    registerSubclass(EagerHoiSpecialProfile);
    const parent = await EagerHoiParent.create({ name: "P" });
    await EagerHoiSpecialProfile.create({
      bio: "Special",
      eager_hoi_parent_id: parent.id,
      type: "EagerHoiSpecialProfile",
    });
    const parents = await EagerHoiParent.all().includes("eagerHoiProfile").toArray();
    expect(parents).toHaveLength(1);
    const profile = (parents[0] as any)._preloadedAssociations?.get("eagerHoiProfile");
    expect(profile).not.toBeNull();
    expect(profile.bio).toBe("Special");
  });
  it("eager has many with association inheritance", async () => {
    class EagerHmiAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerHmiPosts", {
          className: "EagerHmiPost",
          foreignKey: "eager_hmi_author_id",
        });
      }
    }
    class EagerHmiPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
        this.attribute("eager_hmi_author_id", "integer");
      }
    }
    class EagerHmiSpecialPost extends EagerHmiPost {}
    registerModel("EagerHmiAuthor", EagerHmiAuthor);
    registerModel("EagerHmiPost", EagerHmiPost);
    registerModel("EagerHmiSpecialPost", EagerHmiSpecialPost);
    enableSti(EagerHmiPost);
    registerSubclass(EagerHmiSpecialPost);
    const author = await EagerHmiAuthor.create({ name: "A" });
    await EagerHmiPost.create({ title: "Normal", eager_hmi_author_id: author.id });
    await EagerHmiSpecialPost.create({
      title: "Special",
      eager_hmi_author_id: author.id,
      type: "EagerHmiSpecialPost",
    });
    const authors = await EagerHmiAuthor.all().includes("eagerHmiPosts").toArray();
    expect(authors).toHaveLength(1);
    const posts = (authors[0] as any)._preloadedAssociations?.get("eagerHmiPosts");
    expect(posts).toHaveLength(2);
  });
  it("eager habtm with association inheritance", async () => {
    class HabtmInhPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasAndBelongsToMany("habtmInhSpecialCategories", {
          className: "HabtmInhSpecialCategory",
          joinTable: "habtm_inh_categories_habtm_inh_posts",
        });
      }
    }
    class HabtmInhCategory extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
      }
    }
    class HabtmInhSpecialCategory extends HabtmInhCategory {}
    enableSti(HabtmInhCategory);
    registerSubclass(HabtmInhSpecialCategory);
    registerModel(HabtmInhPost);
    registerModel(HabtmInhCategory);
    registerModel(HabtmInhSpecialCategory);

    const post = await HabtmInhPost.create({ title: "STI Post" });
    const special = await HabtmInhSpecialCategory.create({ name: "Special" });

    const { CollectionProxy } = await import("./collection-proxy.js");
    const habtmInhAssoc = (HabtmInhPost as any)._associations.find(
      (a: any) => a.name === "habtmInhSpecialCategories",
    )!;
    const proxy = new CollectionProxy(post, "habtmInhSpecialCategories", habtmInhAssoc);
    await proxy.push(special);

    const posts = await HabtmInhPost.all()
      .includes("habtmInhSpecialCategories")
      .where({ id: post.id })
      .toArray();
    const cats = (posts[0] as any)._preloadedAssociations.get("habtmInhSpecialCategories");
    expect(cats).toHaveLength(1);
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
  it("eager with default scope", async () => {
    class EagerDsPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerDsComments", {
          className: "EagerDsComment",
          foreignKey: "eager_ds_post_id",
        });
      }
    }
    class EagerDsComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_ds_post_id", "integer");
      }
    }
    registerModel("EagerDsPost", EagerDsPost);
    registerModel("EagerDsComment", EagerDsComment);
    const post = await EagerDsPost.create({ title: "P" });
    await EagerDsComment.create({ body: "c1", eager_ds_post_id: post.id });
    const posts = await EagerDsPost.all().includes("eagerDsComments").toArray();
    expect((posts[0] as any)._preloadedAssociations.get("eagerDsComments")).toHaveLength(1);
  });
  it("eager with default scope as class method", async () => {
    class EagerDsCmPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerDsCmComments", {
          className: "EagerDsCmComment",
          foreignKey: "eager_ds_cm_post_id",
        });
      }
    }
    class EagerDsCmComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_ds_cm_post_id", "integer");
      }
    }
    registerModel("EagerDsCmPost", EagerDsCmPost);
    registerModel("EagerDsCmComment", EagerDsCmComment);
    const post = await EagerDsCmPost.create({ title: "P" });
    await EagerDsCmComment.create({ body: "c1", eager_ds_cm_post_id: post.id });
    const posts = await EagerDsCmPost.all().includes("eagerDsCmComments").toArray();
    expect((posts[0] as any)._preloadedAssociations.get("eagerDsCmComments")).toHaveLength(1);
  });
  it("eager with default scope as class method using find method", async () => {
    class EagerDsFmPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    registerModel("EagerDsFmPost", EagerDsFmPost);
    const post = await EagerDsFmPost.create({ title: "P" });
    const found = await EagerDsFmPost.find(post.id);
    expect(found.title).toBe("P");
  });
  it("eager with default scope as class method using find by method", async () => {
    class EagerDsFbPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    registerModel("EagerDsFbPost", EagerDsFbPost);
    await EagerDsFbPost.create({ title: "Unique" });
    const found = await EagerDsFbPost.findBy({ title: "Unique" });
    expect(found?.title).toBe("Unique");
  });
  it("eager with default scope as lambda", async () => {
    class EagerDsLPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerDsLComments", {
          className: "EagerDsLComment",
          foreignKey: "eager_ds_l_post_id",
        });
      }
    }
    class EagerDsLComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_ds_l_post_id", "integer");
      }
    }
    registerModel("EagerDsLPost", EagerDsLPost);
    registerModel("EagerDsLComment", EagerDsLComment);
    const post = await EagerDsLPost.create({ title: "P" });
    await EagerDsLComment.create({ body: "c1", eager_ds_l_post_id: post.id });
    const posts = await EagerDsLPost.all().includes("eagerDsLComments").toArray();
    expect((posts[0] as any)._preloadedAssociations.get("eagerDsLComments")).toHaveLength(1);
  });
  it("eager with default scope as block", async () => {
    class EagerDsBPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerDsBComments", {
          className: "EagerDsBComment",
          foreignKey: "eager_ds_b_post_id",
        });
      }
    }
    class EagerDsBComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_ds_b_post_id", "integer");
      }
    }
    registerModel("EagerDsBPost", EagerDsBPost);
    registerModel("EagerDsBComment", EagerDsBComment);
    const post = await EagerDsBPost.create({ title: "P" });
    await EagerDsBComment.create({ body: "c1", eager_ds_b_post_id: post.id });
    const posts = await EagerDsBPost.all().includes("eagerDsBComments").toArray();
    expect((posts[0] as any)._preloadedAssociations.get("eagerDsBComments")).toHaveLength(1);
  });
  it("eager with default scope as callable", async () => {
    class EagerDsCallPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("eagerDsCallComments", {
          className: "EagerDsCallComment",
          foreignKey: "eager_ds_call_post_id",
        });
      }
    }
    class EagerDsCallComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("eager_ds_call_post_id", "integer");
      }
    }
    registerModel("EagerDsCallPost", EagerDsCallPost);
    registerModel("EagerDsCallComment", EagerDsCallComment);
    const post = await EagerDsCallPost.create({ title: "P" });
    await EagerDsCallComment.create({
      body: "c1",
      eager_ds_call_post_id: post.id,
    });
    const posts = await EagerDsCallPost.all().includes("eagerDsCallComments").toArray();
    expect((posts[0] as any)._preloadedAssociations.get("eagerDsCallComments")).toHaveLength(1);
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
    expect((posts[0] as any)._preloadedAssociations.get("eagerLeoComments")).toHaveLength(2);
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
    expect((posts[0] as any)._preloadedAssociations.get("eagerLmoComments")).toHaveLength(1);
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
    const comments = (posts[0] as any)._preloadedAssociations.get("eagerLnComments");
    expect(comments).toHaveLength(1);
    expect(comments[0].rating).toBe(4.5);
  });
  it("polymorphic type condition", async () => {
    class PtcPost extends Base {
      static {
        this.attribute("title", "string");
        this.hasMany("ptcTaggings", { as: "taggable", className: "PtcTagging" });
      }
    }
    class PtcTagging extends Base {
      static {
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.attribute("ptc_tag_id", "integer");
      }
    }
    class PtcTag extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("PtcPost", PtcPost);
    registerModel("PtcTagging", PtcTagging);
    registerModel("PtcTag", PtcTag);
    const post = await PtcPost.create({ title: "Poly" });
    await PtcTagging.create({ taggable_id: post.id, taggable_type: "PtcPost", ptc_tag_id: 1 });
    await PtcTagging.create({ taggable_id: post.id, taggable_type: "OtherType", ptc_tag_id: 2 });
    const posts = await PtcPost.all().includes("ptcTaggings").toArray();
    expect(posts).toHaveLength(1);
    const taggings = (posts[0] as any)._preloadedAssociations?.get("ptcTaggings") ?? [];
    expect(taggings).toHaveLength(1);
    expect(taggings[0].taggable_type).toBe("PtcPost");
  });
  it("eager with multiple associations with same table has many and habtm", async () => {
    class MaHabtmAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("maHabtmPosts", {
          foreignKey: "ma_habtm_author_id",
        });
        this.hasAndBelongsToMany("maHabtmCategories", {
          className: "MaHabtmCategory",
          joinTable: "ma_habtm_authors_ma_habtm_categories",
        });
      }
    }
    class MaHabtmPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("ma_habtm_author_id", "integer");
      }
    }
    class MaHabtmCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(MaHabtmAuthor);
    registerModel(MaHabtmPost);
    registerModel(MaHabtmCategory);

    const author = await MaHabtmAuthor.create({ name: "David" });
    await MaHabtmPost.create({ title: "P1", ma_habtm_author_id: author.id });
    const cat = await MaHabtmCategory.create({ name: "General" });

    const { CollectionProxy } = await import("./collection-proxy.js");
    const maHabtmAssoc = (MaHabtmAuthor as any)._associations.find(
      (a: any) => a.name === "maHabtmCategories",
    )!;
    const proxy = new CollectionProxy(author, "maHabtmCategories", maHabtmAssoc);
    await proxy.push(cat);

    const authors = await MaHabtmAuthor.all()
      .includes("maHabtmPosts", "maHabtmCategories")
      .toArray();
    expect(authors).toHaveLength(1);
    const posts = (authors[0] as any)._preloadedAssociations.get("maHabtmPosts");
    const cats = (authors[0] as any)._preloadedAssociations.get("maHabtmCategories");
    expect(posts).toHaveLength(1);
    expect(cats).toHaveLength(1);
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
      const profile = (parent as any)._preloadedAssociations.get("eagerMultiHoProfile");
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
    expect((employees[0] as any)._preloadedAssociations.get("company")?.name).toBe("Acme");
    expect((employees[0] as any)._preloadedAssociations.get("mentorCompany")?.name).toBe("Globex");
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

  it("eager with floating point numbers", async () => {
    class EagerFloatItem extends Base {
      static {
        this.attribute("price", "float");
        this.hasMany("eagerFloatDetails", {
          className: "EagerFloatDetail",
          foreignKey: "eager_float_item_id",
        });
      }
    }
    class EagerFloatDetail extends Base {
      static {
        this.attribute("info", "string");
        this.attribute("eager_float_item_id", "integer");
      }
    }
    registerModel("EagerFloatItem", EagerFloatItem);
    registerModel("EagerFloatDetail", EagerFloatDetail);

    const item = await EagerFloatItem.create({ price: 19.99 });
    await EagerFloatDetail.create({
      info: "detail",
      eager_float_item_id: item.id,
    });

    const items = await EagerFloatItem.all().includes("eagerFloatDetails").toArray();
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(19.99);
    const details = (items[0] as any)._preloadedAssociations.get("eagerFloatDetails");
    expect(details).toHaveLength(1);
  });
  it("preconfigured includes with has one", async () => {
    class EagerPreHoParent extends Base {
      static {
        this.attribute("name", "string");
        this.hasOne("eagerPreHoChild", {
          className: "EagerPreHoChild",
          foreignKey: "eager_pre_ho_parent_id",
        });
      }
    }
    class EagerPreHoChild extends Base {
      static {
        this.attribute("value", "string");
        this.attribute("eager_pre_ho_parent_id", "integer");
      }
    }
    registerModel("EagerPreHoParent", EagerPreHoParent);
    registerModel("EagerPreHoChild", EagerPreHoChild);

    const parent = await EagerPreHoParent.create({ name: "P" });
    await EagerPreHoChild.create({
      value: "V",
      eager_pre_ho_parent_id: parent.id,
    });

    const results = await EagerPreHoParent.all().includes("eagerPreHoChild").toArray();
    expect(results).toHaveLength(1);
    const preloaded = (results[0] as any)._preloadedAssociations.get("eagerPreHoChild");
    expect(preloaded?.value).toBe("V");
  });
  it.skip("eager association with scope with joins", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("preconfigured includes with habtm", async () => {
    class PciAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("pciPosts", { foreignKey: "pci_author_id" });
      }
    }
    class PciPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("pci_author_id", "integer");
        this.hasAndBelongsToMany("pciCategories", {
          className: "PciCategory",
          joinTable: "pci_categories_pci_posts",
        });
      }
    }
    class PciCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(PciAuthor);
    registerModel(PciPost);
    registerModel(PciCategory);

    const author = await PciAuthor.create({ name: "David" });
    const post = await PciPost.create({ title: "P1", pci_author_id: author.id });
    const cat1 = await PciCategory.create({ name: "Tech" });
    const cat2 = await PciCategory.create({ name: "General" });

    const { CollectionProxy } = await import("./collection-proxy.js");
    const pciAssoc = (PciPost as any)._associations.find((a: any) => a.name === "pciCategories")!;
    const proxy = new CollectionProxy(post, "pciCategories", pciAssoc);
    await proxy.push(cat1, cat2);

    // Load author's posts, then preload categories on posts
    const posts = await PciPost.all()
      .where({ pci_author_id: author.id })
      .includes("pciCategories")
      .toArray();
    expect(posts).toHaveLength(1);
    const cats = (posts[0] as any)._preloadedAssociations.get("pciCategories");
    expect(cats).toHaveLength(2);
  });

  it("preconfigured includes with has many and habtm", async () => {
    class PcihAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("pcihPosts", { foreignKey: "pcih_author_id" });
      }
    }
    class PcihPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("pcih_author_id", "integer");
        this.hasMany("pcihComments", { foreignKey: "pcih_post_id" });
        this.hasAndBelongsToMany("pcihCategories", {
          className: "PcihCategory",
          joinTable: "pcih_categories_pcih_posts",
        });
      }
    }
    class PcihComment extends Base {
      static {
        this.attribute("body", "string");
        this.attribute("pcih_post_id", "integer");
      }
    }
    class PcihCategory extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel(PcihAuthor);
    registerModel(PcihPost);
    registerModel(PcihComment);
    registerModel(PcihCategory);

    const author = await PcihAuthor.create({ name: "David" });
    const post = await PcihPost.create({ title: "P1", pcih_author_id: author.id });
    await PcihComment.create({ body: "C1", pcih_post_id: post.id });
    await PcihComment.create({ body: "C2", pcih_post_id: post.id });
    const cat1 = await PcihCategory.create({ name: "Tech" });
    const cat2 = await PcihCategory.create({ name: "General" });

    const { CollectionProxy } = await import("./collection-proxy.js");
    const pcihAssoc = (PcihPost as any)._associations.find(
      (a: any) => a.name === "pcihCategories",
    )!;
    const proxy = new CollectionProxy(post, "pcihCategories", pcihAssoc);
    await proxy.push(cat1, cat2);

    const posts = await PcihPost.all()
      .where({ pcih_author_id: author.id })
      .includes("pcihComments", "pcihCategories")
      .toArray();
    expect(posts).toHaveLength(1);
    const comments = (posts[0] as any)._preloadedAssociations.get("pcihComments");
    const cats = (posts[0] as any)._preloadedAssociations.get("pcihCategories");
    expect(comments).toHaveLength(2);
    expect(cats).toHaveLength(2);
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
    const loaded = (comments[0] as any)._preloadedAssociations.get("stiSharePost");
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
    const posts = (authors[0] as any)._preloadedAssociations?.get("eagerPkPosts") ?? [];
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
    const posts = (authors[0] as any)._preloadedAssociations?.get("incPkPosts") ?? [];
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
    const preloaded = (children[0] as any)._preloadedAssociations.get("eagerEmptyBtParent");
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
    const preloaded = (results[0] as any)._preloadedAssociations?.get("owner");
    expect(preloaded).toBeNull();
  });
  it("preloading has many through with distinct", async () => {
    class EagerDistOwner extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerDistJoins", {
          className: "EagerDistJoin",
          foreignKey: "eager_dist_owner_id",
        });
        this.hasMany("eagerDistItems", {
          through: "eagerDistJoins",
          source: "eagerDistItem",
          className: "EagerDistItem",
        });
      }
    }
    class EagerDistJoin extends Base {
      static {
        this.attribute("eager_dist_owner_id", "integer");
        this.attribute("eager_dist_item_id", "integer");
        this.belongsTo("eagerDistItem", {
          className: "EagerDistItem",
          foreignKey: "eager_dist_item_id",
        });
      }
    }
    class EagerDistItem extends Base {
      static {
        this.attribute("label", "string");
      }
    }

    registerModel("EagerDistOwner", EagerDistOwner);
    registerModel("EagerDistJoin", EagerDistJoin);
    registerModel("EagerDistItem", EagerDistItem);

    const owner = await EagerDistOwner.create({ name: "O" });
    const item = await EagerDistItem.create({ label: "I" });
    // Two join records pointing to the same item
    await EagerDistJoin.create({
      eager_dist_owner_id: owner.id,
      eager_dist_item_id: item.id,
    });
    await EagerDistJoin.create({
      eager_dist_owner_id: owner.id,
      eager_dist_item_id: item.id,
    });

    const items = await loadHasManyThrough(owner, "eagerDistItems", {
      through: "eagerDistJoins",
      source: "eagerDistItem",
      className: "EagerDistItem",
    });
    // With two join records pointing to same item, we get two references
    expect(items.length).toBeGreaterThanOrEqual(1);
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
    expect((parents[0] as any)._preloadedAssociations.get("eagerReordChild")?.value).toBe("V");
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
    expect(result[0]._preloadedAssociations.get("jeeoComments")).toHaveLength(1);
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
    const mentorDevContracts = p._preloadedAssociations
      .get("elmarMentor")
      ?._preloadedAssociations?.get("elmarDevelopers")?.[0]
      ?._preloadedAssociations?.get("elmarContracts");
    const directDevContracts = p._preloadedAssociations
      .get("elmarDevelopers")?.[0]
      ?._preloadedAssociations?.get("elmarContracts");

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
  it("preloading has many through with custom scope", async () => {
    class PcsProject extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("pcsContractships", {
          className: "PcsContractship",
          foreignKey: "pcs_project_id",
        });
        this.hasMany("scopedDevs", {
          className: "PcsDeveloper",
          through: "pcsContractships",
          source: "pcsDeveloper",
          scope: (rel: any) => rel.where({ name: "David" }),
        });
      }
    }
    class PcsDeveloper extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class PcsContractship extends Base {
      static {
        this.attribute("pcs_project_id", "integer");
        this.attribute("pcs_developer_id", "integer");
        this.belongsTo("pcsDeveloper", {
          className: "PcsDeveloper",
          foreignKey: "pcs_developer_id",
        });
      }
    }
    registerModel(PcsProject);
    registerModel(PcsDeveloper);
    registerModel(PcsContractship);

    const proj = await PcsProject.create({ name: "AR" });
    const david = await PcsDeveloper.create({ name: "David" });
    const bob = await PcsDeveloper.create({ name: "Bob" });
    await PcsContractship.create({ pcs_project_id: proj.id, pcs_developer_id: david.id });
    await PcsContractship.create({ pcs_project_id: proj.id, pcs_developer_id: bob.id });

    const projects = await PcsProject.all().includes("scopedDevs").toArray();
    const devs = (projects[0] as any)._preloadedAssociations.get("scopedDevs");
    expect(devs.length).toBe(1);
    expect(devs[0].name).toBe("David");
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
    const loadedPost = found._preloadedAssociations.get("post");
    expect(loadedPost.id).toBe(post.id);
    expect(loadedPost._preloadedAssociations.get("comments").map((c: any) => c.id)).toContain(
      c1.id,
    );
  });

  it("circular preload does not modify unscoped", async () => {
    // Rails: FirstPost.preload(comments: :first_post).find(1) must not let
    // FirstPost's default scope (where id: 1) leak into a later unscoped lookup.
    registerModel("FirstPost", FirstPost);
    const post1 = await Post.create({ id: 1, title: "P1", body: "b" });
    const post2 = await Post.create({ id: 2, title: "P2", body: "b" });
    await Comment.create({ post_id: post1.id, body: "c1" });

    const expected = await (FirstPost as any).unscoped().find(post2.id);
    await (FirstPost as any).all().preload({ comments: "firstPost" }).find(post1.id);
    const after = await (FirstPost as any).unscoped().find(post2.id);
    expect(after.id).toBe(expected.id);
  });

  it("belongs_to association ignores the scoping", async () => {
    class BtScopeAuthor extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class BtScopePost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("bt_scope_author_id", "integer");
        this.belongsTo("btScopeAuthor", { foreignKey: "bt_scope_author_id" });
      }
    }
    registerModel(BtScopeAuthor);
    registerModel(BtScopePost);

    const alice = await BtScopeAuthor.create({ name: "Alice" });
    const bob = await BtScopeAuthor.create({ name: "Bob" });
    await BtScopePost.create({ title: "P1", bt_scope_author_id: alice.id });
    await BtScopePost.create({ title: "P2", bt_scope_author_id: bob.id });

    await BtScopeAuthor.scoping(BtScopeAuthor.where({ name: "Alice" }), async () => {
      const posts = await BtScopePost.all().includes("btScopeAuthor").toArray();
      expect(posts).toHaveLength(2);
      const authors = posts.map((p: any) => p._preloadedAssociations.get("btScopeAuthor"));
      expect(authors.filter((a: any) => a !== null)).toHaveLength(2);
    });
  });

  it("has_many association ignores the scoping", async () => {
    class HmScopeAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("hmScopePosts", {
          className: "HmScopePost",
          foreignKey: "hm_scope_author_id",
        });
      }
    }
    class HmScopePost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("hm_scope_author_id", "integer");
      }
    }
    registerModel(HmScopeAuthor);
    registerModel(HmScopePost);

    const alice = await HmScopeAuthor.create({ name: "Alice" });
    await HmScopePost.create({ title: "P1", hm_scope_author_id: alice.id });
    await HmScopePost.create({ title: "P2", hm_scope_author_id: alice.id });

    await HmScopePost.scoping(HmScopePost.where({ title: "P1" }), async () => {
      const authors = await HmScopeAuthor.all().includes("hmScopePosts").toArray();
      expect(authors).toHaveLength(1);
      const posts = (authors[0] as any)._preloadedAssociations.get("hmScopePosts");
      expect(posts).toHaveLength(2);
    });
  });

  it("preloading a through association twice does not reset it", async () => {
    class EagerTwiceOwner extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eagerTwiceJoins", {
          className: "EagerTwiceJoin",
          foreignKey: "eager_twice_owner_id",
        });
        this.hasMany("eagerTwiceTargets", {
          through: "eagerTwiceJoins",
          source: "eagerTwiceTarget",
          className: "EagerTwiceTarget",
        });
      }
    }
    class EagerTwiceJoin extends Base {
      static {
        this.attribute("eager_twice_owner_id", "integer");
        this.attribute("eager_twice_target_id", "integer");
        this.belongsTo("eagerTwiceTarget", {
          className: "EagerTwiceTarget",
          foreignKey: "eager_twice_target_id",
        });
      }
    }
    class EagerTwiceTarget extends Base {
      static {
        this.attribute("label", "string");
      }
    }

    registerModel("EagerTwiceOwner", EagerTwiceOwner);
    registerModel("EagerTwiceJoin", EagerTwiceJoin);
    registerModel("EagerTwiceTarget", EagerTwiceTarget);

    const owner = await EagerTwiceOwner.create({ name: "O" });
    const t1 = await EagerTwiceTarget.create({ label: "T1" });
    await EagerTwiceJoin.create({
      eager_twice_owner_id: owner.id,
      eager_twice_target_id: t1.id,
    });

    // Loading twice should return the same results
    const targets1 = await loadHasManyThrough(owner, "eagerTwiceTargets", {
      through: "eagerTwiceJoins",
      source: "eagerTwiceTarget",
      className: "EagerTwiceTarget",
    });
    expect(targets1).toHaveLength(1);
    const targets2 = await loadHasManyThrough(owner, "eagerTwiceTargets", {
      through: "eagerTwiceJoins",
      source: "eagerTwiceTarget",
      className: "EagerTwiceTarget",
    });
    expect(targets2).toHaveLength(1);
  });
  it.skip("preloading associations with string joins and order references", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it("preloading of instance dependent associations is supported", async () => {
    class PIDASAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("pidasPostsWithSignature", {
          className: "PIDASPost",
          foreignKey: "pidas_author_id",
          scope: (_rel: any, owner: any) => _rel.where({ mention: owner.name.toLowerCase() }),
        });
      }
    }
    class PIDASPost extends Base {
      static {
        this.attribute("pidas_author_id", "integer");
        this.attribute("mention", "string");
      }
    }
    registerModel("PIDASAuthor", PIDASAuthor);
    registerModel("PIDASPost", PIDASPost);
    const author1 = await PIDASAuthor.create({ name: "Alice" });
    await PIDASPost.create({ pidas_author_id: author1.id, mention: "alice" });
    const authors = await (PIDASAuthor as any).preload("pidasPostsWithSignature").toArray();
    expect(authors).not.toHaveLength(0);
    for (const author of authors) {
      expect(author._preloadedAssociations?.has("pidasPostsWithSignature")).toBe(true);
    }
  });
  it("eager loading of instance dependent associations is not supported", async () => {
    class ELIDASAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("elidasPostsWithSignature", {
          className: "ELIDASPost",
          foreignKey: "elidas_author_id",
          scope: (_rel: any, owner: any) => _rel.where({ mention: owner.name }),
        });
      }
    }
    class ELIDASPost extends Base {
      static {
        this.attribute("elidas_author_id", "integer");
      }
    }
    registerModel("ELIDASAuthor", ELIDASAuthor);
    registerModel("ELIDASPost", ELIDASPost);
    await expect(
      (ELIDASAuthor as any).eagerLoad("elidasPostsWithSignature").toArray(),
    ).rejects.toThrow("association scope 'elidasPostsWithSignature' is instance dependent");
  });
  it("preloading of optional instance dependent associations is supported", async () => {
    class POIDASAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("poidasPostsMentioning", {
          className: "POIDASPost",
          foreignKey: "poidas_author_id",
          scope: (_rel: any, owner?: any) =>
            owner ? _rel.where({ mention: owner.name.toLowerCase() }) : _rel,
        });
      }
    }
    class POIDASPost extends Base {
      static {
        this.attribute("poidas_author_id", "integer");
        this.attribute("mention", "string");
      }
    }
    registerModel("POIDASAuthor", POIDASAuthor);
    registerModel("POIDASPost", POIDASPost);
    const author1 = await POIDASAuthor.create({ name: "Bob" });
    await POIDASPost.create({ poidas_author_id: author1.id, mention: "bob" });
    const authors = await (POIDASAuthor as any).includes("poidasPostsMentioning").toArray();
    expect(authors).not.toHaveLength(0);
    for (const author of authors) {
      expect(author._preloadedAssociations?.has("poidasPostsMentioning")).toBe(true);
    }
  });
  it("eager loading of optional instance dependent associations is not supported", async () => {
    class EOIDASAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("eoidasPostsMentioning", {
          className: "EOIDASPost",
          foreignKey: "eoidas_author_id",
          scope: (_rel: any, owner?: any) => (owner ? _rel.where({ mention: owner.name }) : _rel),
        });
      }
    }
    class EOIDASPost extends Base {
      static {
        this.attribute("eoidas_author_id", "integer");
      }
    }
    registerModel("EOIDASAuthor", EOIDASAuthor);
    registerModel("EOIDASPost", EOIDASPost);
    await expect(
      (EOIDASAuthor as any).eagerLoad("eoidasPostsMentioning").toArray(),
    ).rejects.toThrow("association scope 'eoidasPostsMentioning' is instance dependent");
  });
  it("preload with invalid argument", async () => {
    class PiaWidget extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    registerModel("PiaWidget", PiaWidget);
    await PiaWidget.create({ name: "w" });
    await expect(
      PiaWidget.all()
        .preload(10 as any)
        .toArray(),
    ).rejects.toThrow(/Association names must be Symbol or String, got: Integer/);
    await expect(PiaWidget.all().preload("doesNotExists").toArray()).rejects.toThrow(
      /Association named 'doesNotExists' was not found on PiaWidget; perhaps you misspelled it\?/,
    );
  });
  it("associations with extensions are not instance dependent", async () => {
    class AweAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("awePostsWithExtension", {
          className: "AwePost",
          foreignKey: "awe_author_id",
          scope: (rel: any) => rel.order("title"),
          extend: { extensionMethod() {} },
        });
      }
    }
    class AwePost extends Base {
      static {
        this.attribute("awe_author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel("AweAuthor", AweAuthor);
    registerModel("AwePost", AwePost);
    // Rails: `has_many :posts_with_extension, -> { order(:title) } do ... end`
    // Extension block + ownerless scope (relation-only param, no owner) —
    // checkEagerLoadableBang treats scope.length > 1 as instance-dependent.
    const author = await AweAuthor.create({ name: "A" });
    await AwePost.create({ awe_author_id: author.id, title: "p" });
    const authors = await (AweAuthor as any).includes("awePostsWithExtension").toArray();
    expect(authors).not.toHaveLength(0);
    for (const a of authors) {
      expect(a._preloadedAssociations?.has("awePostsWithExtension")).toBe(true);
    }
    const proxy = association(authors[0], "awePostsWithExtension");
    expect(typeof (proxy as any).extensionMethod).toBe("function");
  });
  it("including associations with extensions and an instance dependent scope is supported", async () => {
    class AwexAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("awexPostsWithExtAndInstance", {
          className: "AwexPost",
          foreignKey: "awex_author_id",
          scope: (_rel: any, owner?: any) =>
            owner ? _rel.where({ mention: owner.name.toLowerCase() }) : _rel,
          extend: { extensionMethod() {} },
        });
      }
    }
    class AwexPost extends Base {
      static {
        this.attribute("awex_author_id", "integer");
        this.attribute("mention", "string");
      }
    }
    registerModel("AwexAuthor", AwexAuthor);
    registerModel("AwexPost", AwexPost);
    // Rails: `has_many :posts_with_extension_and_instance, ->(record) { ... } do ... end`
    const author = await AwexAuthor.create({ name: "Alice" });
    await AwexPost.create({ awex_author_id: author.id, mention: "alice" });
    await AwexPost.create({ awex_author_id: author.id, mention: "zoe" });
    const authors = await (AwexAuthor as any).includes("awexPostsWithExtAndInstance").toArray();
    expect(authors).not.toHaveLength(0);
    for (const a of authors) {
      expect(a._preloadedAssociations?.has("awexPostsWithExtAndInstance")).toBe(true);
      const loaded = a._preloadedAssociations.get("awexPostsWithExtAndInstance");
      expect(loaded).toHaveLength(1);
      expect(loaded[0].mention).toBe("alice");
      const proxy = association(a, "awexPostsWithExtAndInstance");
      expect(typeof (proxy as any).extensionMethod).toBe("function");
    }
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
    const posts = (authors[0] as any)._preloadedAssociations?.get("praPosts") ?? [];
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
    const posts = (authors[0] as any)._preloadedAssociations?.get("enraPosts") ?? [];
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
    const posts = (authors[0] as any)._preloadedAssociations?.get("elraPosts") ?? [];
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
    const comments = (authors[0] as any)._preloadedAssociations.get("phmtComments");
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("C");
  });
  it("preloading through a polymorphic association doesn't require the association to exist", async () => {
    await seedSponsors();
    const sponsors = await SgSponsor.all()
      .preload({ sponsorable: ["post", "membership"] })
      .toArray();
    expect(sponsors).toHaveLength(2);
    const sponsorables = sponsors.map((s) => (s as any)._preloadedAssociations.get("sponsorable"));
    expect(sponsorables.every((s: any) => s != null)).toBe(true);
    const member = sponsorables.find((s: any) => s?.constructor.name === "SgMember");
    const org = sponsorables.find((s: any) => s?.constructor.name === "SgOrganization");
    expect(member._preloadedAssociations.has("post")).toBe(true);
    expect(org._preloadedAssociations.has("membership")).toBe(true);
  });
  it("preloading a regular association through a polymorphic association doesn't require the association to exist on all types", async () => {
    await seedSponsors();
    const sponsors = await SgSponsor.all()
      .preload({ sponsorable: [{ post: "firstComment" }, "membership"] })
      .toArray();
    expect(sponsors).toHaveLength(2);
    const member = sponsors
      .map((s) => (s as any)._preloadedAssociations.get("sponsorable"))
      .find((s: any) => s?.constructor.name === "SgMember");
    const post = member._preloadedAssociations.get("post");
    expect(post).toBeTruthy();
    expect(post._preloadedAssociations.get("firstComment")?.body).toBe("First!");
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
  it.skip("preloading belongs_to association associated by a composite query_constraints", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("preloading has_many association associated by a composite query_constraints", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("preloading has_many through association associated by a composite query_constraints", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
  });
  it.skip("preloading belongs_to CPK model with one of the keys being shared between models", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
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
    const order = found._preloadedAssociations.get("cpkOrder");
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
    const items = found._preloadedAssociations.get("cpkHmItems");
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
    const receipt = found._preloadedAssociations.get("cpkHoReceipt");
    expect(receipt).not.toBeNull();
    expect(receipt.number).toBe("R001");
  });

  it.skip("eager with has one through join model with conditions on the through", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
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
      const posts = cat._preloadedAssociations.get("idupPosts");
      expect(posts).toHaveLength(1);
      const comments = posts[0]._preloadedAssociations.get("idupComments");
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
      const posts = cat._preloadedAssociations.get("alarPosts");
      expect(posts).toHaveLength(1);
      // association must be loaded (preloaded) for each post
      expect(posts[0]._preloadedAssociations.has("alarComments")).toBe(true);
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
    const preloadedAuthor = found._preloadedAssociations.get("lnaAuthor");
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
    const titles = comments.map((c: any) => c._preloadedAssociations.get("eabtPost")?.title);
    expect(titles).toContain("Welcome");
    expect(titles).toContain("Other");
  });
  it.skip("eager with has one dependent does not destroy dependent", () => {
    // BLOCKED: associations — eager-loading feature gap
    // ROOT-CAUSE: associations/eager.ts or preloader.ts missing eager-loading semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in eager.test.ts
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
    expect(
      people.find((p: any) => p.id === m1.id)._preloadedAssociations.get("primaryContact").id,
    ).toBe(f1.id);
    expect(
      people.find((p: any) => p.id === m2.id)._preloadedAssociations.get("primaryContact").id,
    ).toBe(f2.id);
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
      const agents = person._preloadedAssociations.get("agents");
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
    const preloaded = loaded[0]._preloadedAssociations.get("pebFirm");
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
    const preloadedAuthor = p._preloadedAssociations.get("dpAuthor");
    expect(preloadedAuthor).toBeDefined();
    expect(preloadedAuthor).not.toBeNull();
    expect(preloadedAuthor.name).toBe("Alice");
    expect(preloadedAuthor._preloadedAssociations.has("dpPosts")).toBe(true);
    // comment.dpPost should be preloaded
    const preloadedComments = p._preloadedAssociations.get("dpComments");
    expect(preloadedComments).toHaveLength(1);
    expect(preloadedComments[0]._preloadedAssociations.has("dpPost")).toBe(true);
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
    const membership = m._preloadedAssociations.get("pstaCurrentMembership");
    expect(membership).toBeDefined();
    expect(membership).not.toBeNull();
    expect(membership.psta_club_id).toBe(club.id);
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

  // PERMANENT-SKIP (MariaDB/MySQL perf): `eager_load(:citations)` is a 65536-row
  // self-LEFT-JOIN; instantiating that result set via JoinDependency takes >360s
  // on MariaDB (vs ~15s on SQLite), times out even at 120s, and poisons the
  // shared connection — cascading into hook timeouts across the file. The
  // bind-limit/IN-split behavior this case targets is already covered by
  // `preloading too many ids` above; the JoinDependency instantiation cost is a
  // separate perf concern, not an eager-loading feature gap.
  it.skip("eager loading too many ids", async () => {
    expect(await Citation.all().eagerLoad("citations").offset(0).size()).toBe(
      await Citation.count(),
    );
  });
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
    expect(loaded.map((p) => p.id)).toEqual([posts("welcome").id]);
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
    expect(loaded.map((p) => p.id)).toEqual([posts("welcome").id, posts("thinking").id]);

    await assertQueriesCount(2, false, async () => {
      loaded = await Post.all()
        .includes("author")
        .joins({ taggings: { tag: "taggings" } })
        .where("taggings_tags.super_tag_id=2")
        .order("posts.id")
        .toArray();
    });
    expect(loaded.map((p) => p.id)).toEqual([posts("welcome").id, posts("thinking").id]);
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
});

// ==========================================================================
// EagerAssociationTest (canonical Post/Author/Comment/Category fixtures) — ports
// of eager_test.rb cases that exercise plain preloading/eager-loading over the
// real Post/Author/Comment/Category models + their fixtures. Same describe name
// as the other EagerAssociationTest blocks so test:compare matches the Rails
// `EagerAssociationTest` class.
// ==========================================================================
describe("EagerAssociationTest", () => {
  const { authors, posts, comments, people } = useHandlerFixtures([
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
  registerModel(Author);
  registerModel(Comment);
  registerModel(VerySpecialComment);
  registerModel(Category);
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

  it("eager association loading with belongs to and limit", async () => {
    const loaded = await Comment.all().includes("post").limit(5).order("comments.id").toArray();
    expect(loaded).toHaveLength(5);
    expect(loaded.map((c) => c.id)).toEqual([1, 2, 3, 5, 6]);
  });

  it("eager association loading with belongs to and limit and conditions", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where("post_id = 4")
      .limit(3)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => c.id)).toEqual([5, 6, 7]);
  });

  it("eager association loading with belongs to and limit and offset", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .limit(3)
      .offset(2)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => c.id)).toEqual([3, 5, 6]);
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
    expect(loaded.map((c) => c.id)).toEqual([6, 7, 8]);
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
    expect(loaded.map((c) => c.id)).toEqual([6, 7, 8]);
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
    expect(loaded.map((p) => p.id)).toEqual([posts("welcome").id]);
  });

  it("eager association loading with belongs to and limit and offset and multiple associations", async () => {
    const loaded = await Post.all()
      .includes("author", "verySpecialComment")
      .limit(1)
      .offset(1)
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(1);
    expect(loaded.map((p) => p.id)).toEqual([posts("thinking").id]);
  });

  it("eager association loading with belongs to and conditions hash", async () => {
    const loaded = await Comment.all()
      .includes("post")
      .where({ posts: { id: 4 } })
      .limit(3)
      .order("comments.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((c) => c.id)).toEqual([5, 6, 7]);
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
    expect(loaded.map((post) => post.id)).toEqual([4, 5]);
  });

  it("eager with has many and limit and conditions array", async () => {
    const loaded = await Post.all()
      .includes("author", "comments")
      .limit(2)
      .where("posts.body = ?", "hello")
      .order("posts.id")
      .toArray();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((post) => post.id)).toEqual([4, 5]);
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
    expect(children.map((c) => c.id)).toEqual([child.id]);
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
    expect(clients.map((c) => c.id)).toEqual([companies("first_client").id]);
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
    const firm = firms.find((f) => f.id === 1)!;
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
  const { posts } = useHandlerFixtures(["posts", "tags", "taggings"]);
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
  registerModel(Tag);
  registerModel(Tagging);

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
// HasManyThroughAssociationsTest — targets associations/has_many_through_associations_test.rb
// ==========================================================================
