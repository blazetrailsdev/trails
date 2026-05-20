// Mirror of vendor/rails/activerecord/test/schema/schema.rb.
//
// Single canonical schema declaration for the AR fixture port (see
// docs/fixtures-port-plan.md). Tables appear in the same order as the
// Rails source (which is broadly — but not strictly — alphabetical;
// e.g. `paragraphs` sits inside the `cpk_*` block). Built incrementally
// across PRs 0.5a..0.5h; the wire-up into setup-adapter-suite happens
// in the final split.
//
// Features Rails' schema.rb expresses that defineSchema cannot yet
// express (deliberately dropped during the port — fixture-row tests
// don't depend on them):
//   - secondary indexes / expression indexes
//   - foreign-key constraints (add_foreign_key)
//   - SQL function defaults (e.g. CURRENT_TIMESTAMP via -> {})
//   - identifier-length stress columns (t.string "a" * max_identifier_length)
//   - polymorphic helper (modeled directly as `<name>_id` + `<name>_type`)

import type { Schema } from "./define-schema.js";

/**
 * PR 0.5a group: alphabetical range "1_need_quoting".."bulbs" (covers
 * digits, A-tables, and the leading B-tables). Sibling PRs 0.5b..0.5h
 * append the remaining groups to this same object.
 *
 * Tables declared as an empty `{}` mirror Rails `create_table :x do |t| end`
 * — `defineSchema` (and Rails) creates the table with only the implicit
 * primary-key column. Use `{ columns: {...}, primaryKey: false }` for a
 * genuinely id-less table.
 */
export const TEST_SCHEMA: Schema = {
  "1_need_quoting": {
    name: "string",
  },

  accounts: {
    firm_id: "integer",
    firm_name: "string",
    credit_limit: "integer",
    status: "string",
    updated_at: "datetime",
  },

  admin_accounts: {
    name: "string",
  },

  admin_users: {
    name: "string",
    settings: { type: "string", null: true, limit: 1024 },
    parent: { type: "string", null: true, limit: 1024 },
    spouse: { type: "string", null: true, limit: 1024 },
    configs: { type: "string", null: true, limit: 1024 },
    // MySQL does not allow defaults on blobs; Rails fakes it with a large
    // varchar, mirrored here.
    preferences: { type: "string", null: true, default: "", limit: 1024 },
    json_data: { type: "string", null: true, limit: 1024 },
    json_data_empty: { type: "string", null: true, default: "", limit: 1024 },
    params: "text",
    account_id: "integer",
    json_options: "json",
  },

  admin_user_jsons: {
    name: "string",
    settings: { type: "string", null: true, limit: 1024 },
    parent: { type: "string", null: true, limit: 1024 },
    spouse: { type: "string", null: true, limit: 1024 },
    configs: { type: "string", null: true, limit: 1024 },
    preferences: { type: "string", null: true, default: "", limit: 1024 },
    json_data: { type: "string", null: true, limit: 1024 },
    json_data_empty: { type: "string", null: true, default: "", limit: 1024 },
    params: "text",
    account_id: "integer",
  },

  aircraft: {
    name: "string",
    wheels_count: { type: "integer", default: 0, null: false },
    wheels_owned_at: "datetime",
    // Rails uses CURRENT_TIMESTAMP as the default; defineSchema does not
    // yet support SQL function defaults — column kept, default dropped.
    manufactured_at: "datetime",
  },

  articles: {},

  articles_magazines: {
    article_id: "integer",
    magazine_id: "integer",
  },

  articles_tags: {
    article_id: "integer",
    tag_id: "integer",
  },

  attachments: {
    // Polymorphic reference expanded:
    record_id: { type: "integer", null: false },
    record_type: { type: "string", null: false },
  },

  audit_logs: {
    message: { type: "string", null: false },
    developer_id: { type: "integer", null: false },
    unvalidated_developer_id: "integer",
  },

  author_addresses: {},

  authors: {
    name: { type: "string", null: false },
    author_address_id: "integer",
    author_address_extra_id: "integer",
    organization_id: "string",
    owned_essay_id: "string",
  },

  author_favorites: {
    author_id: "integer",
    favorite_author_id: "integer",
  },

  auto_id_tests: {
    columns: {
      auto_id: "integer",
      value: "integer",
      // Rails default: CURRENT_TIMESTAMP — see note at top of file.
      published_at: "datetime",
    },
    primaryKey: ["auto_id"],
  },

  binaries: {
    name: "string",
    data: "binary",
    short_data: { type: "binary", limit: 2048 },
    // Rails uses t.blob; mirrors as binary across our supported adapters.
    blob_data: "binary",
  },

  birds: {
    name: "string",
    color: "string",
    pirate_id: "integer",
  },

  // Rails declares `id: :integer` (narrower than the default bigint).
  // defineSchema currently emits the adapter-default PK type; fixture row
  // ids fit either width, so the override is dropped.
  books: {
    author_id: "integer",
    format: "string",
    format_record_id: "integer",
    format_record_type: "string",
    name: "string",
    status: { type: "integer", default: 0 },
    last_read: { type: "integer", default: 0 },
    nullable_status: "integer",
    language: { type: "integer", default: 0 },
    author_visibility: { type: "integer", default: 0 },
    illustrator_visibility: { type: "integer", default: 0 },
    font_size: { type: "integer", default: 0 },
    difficulty: { type: "integer", default: 0 },
    cover: { type: "string", default: "hard" },
    isbn: "string",
    external_id: "string",
    original_name: "string",
    published_on: "datetime",
    boolean_status: "boolean",
    tags_count: { type: "integer", default: 0 },
    created_at: "datetime",
    updated_at: "datetime",
    updated_on: "date",
  },

  encrypted_books: {
    author_id: "integer",
    format: "string",
    name: { type: "string", default: "<untitled>", limit: 1024 },
    original_name: "string",
    logo: "binary",
    created_at: "datetime",
    updated_at: "datetime",
  },

  hardbacks: {},

  booleans: {
    value: "boolean",
    has_fun: { type: "boolean", null: false, default: false },
  },

  branches: {
    branch_id: "integer",
  },

  bulbs: {
    columns: {
      ID: "integer",
      car_id: "integer",
      name: "string",
      frickinawesome: { type: "boolean", default: false },
      color: "string",
    },
    primaryKey: ["ID"],
  },

  CamelCase: {
    name: "string",
  },

  cars: {
    person_id: "integer",
    name: "string",
    engines_count: "integer",
    wheels_count: { type: "integer", default: 0, null: false },
    wheels_owned_at: "datetime",
    bulbs_count: "integer",
    custom_tyres_count: "integer",
    lock_version: { type: "integer", null: false, default: 0 },
    created_at: { type: "datetime", null: false },
    updated_at: { type: "datetime", null: false },
  },

  // Rails declares `id: :integer`; defineSchema's default bigint PK is
  // wider but accepts the same integer values fixtures emit.
  old_cars: {},

  carriers: {},

  carts: {
    columns: {
      shop_id: "big_integer",
      id: { type: "big_integer", null: false },
      title: "string",
    },
    primaryKey: ["shop_id", "id"],
  },

  categories: {
    name: { type: "string", null: false },
    type: "string",
    categorizations_count: "integer",
  },

  categories_posts: {
    category_id: { type: "integer", null: false },
    post_id: { type: "integer", null: false },
  },

  categorizations: {
    category_id: "integer",
    named_category_name: "string",
    post_id: "integer",
    author_id: "integer",
    special: "boolean",
  },

  citations: {
    book1_id: "integer",
    book2_id: "integer",
    citation_id: "integer",
  },

  cpk_books: {
    columns: {
      author_id: "integer",
      id: "integer",
      title: "string",
      revision: "integer",
      order_id: "integer",
      shop_id: "integer",
    },
    primaryKey: ["author_id", "id"],
  },

  cpk_chapters: {
    columns: {
      author_id: "integer",
      id: "integer",
      book_id: "integer",
      title: "string",
    },
    primaryKey: ["author_id", "id"],
  },

  cpk_authors: {
    name: "string",
  },

  cpk_posts: {
    columns: {
      title: "string",
      author: "string",
    },
    primaryKey: ["title", "author"],
  },

  cpk_comments: {
    commentable_title: "string",
    commentable_author: "string",
    commentable_type: "string",
    text: "text",
  },

  cpk_reviews: {
    author_id: "integer",
    number: "integer",
    rating: "integer",
    comment: "string",
  },

  // Composite PK is configured on the model level; the DB table keeps the
  // default autoincrement `id` so order rows still get one.
  cpk_orders: {
    shop_id: "integer",
    status: "string",
    books_count: { type: "integer", default: 0 },
  },

  cpk_order_tags: {
    columns: {
      order_id: "integer",
      tag_id: "integer",
      attached_by: "string",
      attached_reason: "string",
    },
    primaryKey: ["order_id", "tag_id"],
  },

  cpk_tags: {
    name: { type: "string", null: false },
  },

  cpk_order_agreements: {
    order_id: "integer",
    signature: "string",
  },

  cpk_cars: {
    columns: {
      make: { type: "string", null: false },
      model: { type: "string", null: false },
    },
    primaryKey: ["make", "model"],
  },

  cpk_car_reviews: {
    car_make: { type: "string", null: false },
    car_model: { type: "string", null: false },
    comment: "text",
    rating: "integer",
  },

  paragraphs: {
    book_id: "integer",
  },

  clothing_items: {
    clothing_type: "string",
    color: "string",
    type: "string",
    size: "string",
    description: "text",
  },

  sharded_blogs: {
    name: "string",
  },

  sharded_blog_posts: {
    title: "string",
    parent_id: "integer",
    parent_type: "string",
    blog_id: "integer",
    revision: "integer",
  },

  sharded_comments: {
    body: "string",
    blog_post_id: "integer",
    blog_id: "integer",
  },

  sharded_tags: {
    name: "string",
    blog_id: "integer",
  },

  sharded_blog_posts_tags: {
    blog_id: "integer",
    blog_post_id: "integer",
    tag_id: "integer",
  },

  clubs: {
    name: "string",
    category_id: "integer",
  },

  collections: {
    name: "string",
  },

  colnametests: {
    references: { type: "integer", null: false },
  },

  columns: {
    record_id: "integer",
  },

  comments: {
    post_id: { type: "integer", null: false },
    body: { type: "text", null: false },
    type: "string",
    label: { type: "integer", default: 0 },
    tags_count: { type: "integer", default: 0 },
    children_count: { type: "integer", default: 0 },
    parent_id: "integer",
    author_id: "integer",
    author_type: "string",
    // Rails comment: kept as string so preload works when types don't match.
    resource_id: "string",
    resource_type: "string",
    origin_id: "integer",
    origin_type: "string",
    developer_id: "integer",
    updated_at: "datetime",
    deleted_at: "datetime",
    comments: "integer",
    company: "integer",
  },

  comment_overlapping_counter_caches: {
    user_comments_count_id: "integer",
    post_comments_count_id: "integer",
    commentable_id: "integer",
    commentable_type: "string",
  },

  companies: {
    type: "string",
    firm_id: "integer",
    firm_name: "string",
    name: "string",
    client_of: "big_integer",
    rating: { type: "big_integer", default: 1 },
    account_id: "integer",
    description: { type: "string", default: "" },
    status: { type: "integer", default: 0 },
  },

  content: {
    title: "string",
    book_id: "integer",
    book_destroy_async_id: "integer",
  },

  content_positions: {
    content_id: "integer",
  },

  vegetables: {
    name: "string",
    seller_id: "integer",
    custom_type: "string",
  },

  computers: {
    system: "string",
    developer: { type: "integer", null: false },
    extendedWarranty: { type: "integer", null: false },
    timezone: "integer",
    created_at: "datetime",
    updated_at: "datetime",
  },

  // Rails declares `id: false` — pure join table, no synthetic PK.
  computers_developers: {
    columns: {
      computer_id: "integer",
      developer_id: "integer",
      created_at: "datetime",
      updated_at: "datetime",
    },
    primaryKey: false,
  },
};
