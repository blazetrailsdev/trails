// Mirror of vendor/rails/activerecord/test/schema/schema.rb.
//
// Single canonical schema declaration for the AR fixture port (see
// docs/fixtures-port-plan.md). Tables are added in alphabetical order
// matching the Rails source. Built incrementally across PRs 0.5a..0.5h;
// the wire-up into setup-adapter-suite happens in the final split.
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
};
