/**
 * Canonical test-schema loader — the `ActiveRecord::Schema.define` equivalent.
 *
 * A hand-written sequence of real `connection.createTable(name, opts, t => …)`
 * block calls that lays down the canonical AR test schema, mirroring
 * `vendor/rails/activerecord/test/schema/schema.rb`. Wired into
 * `template-global-setup.ts` so the schema is laid once at boot for every
 * adapter (SQLite / PostgreSQL / MySQL). It produces byte-for-byte the same
 * schema `defineSchema(TEST_SCHEMA)` did — the schema-dumper parity gate for
 * RFC 0059 Phase 1 — while removing the bespoke `defineSchema` DSL from the
 * boot path. `defineSchema` stays live in parallel until phases 2–4 retire it.
 *
 * Hard rules: no `node:*` imports, no `process.*`, async fs only.
 */

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { TableDefinition } from "../connection-adapters/abstract/schema-definitions.js";
import type { ColumnSpec } from "./define-schema.js";
import {
  COLUMN_TYPE_MAP_MYSQL,
  COLUMN_TYPE_MAP_PG,
  COLUMN_TYPE_MAP_SQLITE,
  serialIdType,
  supportsExpressionIndex,
} from "./define-schema.js";

interface ColOpts {
  limit?: number;
  precision?: number | null;
  scale?: number;
  null?: boolean;
  default?: unknown;
  defaultFunction?: string;
}

interface IndexOpts {
  unique?: boolean;
  where?: string;
  name?: string;
  order?: string | Record<string, string>;
  length?: number | Record<string, number>;
  nullsNotDistinct?: boolean;
  using?: string;
  type?: string;
}

/**
 * Thin `create_table` block builder. Each `t.<type>()` maps to the same
 * `t.column(name, mappedType, options)` call `defineSchema` emits — including
 * the per-adapter type map, the single-column serial PK emitted inline at its
 * declared offset, composite-PK NOT NULL, and the MySQL `DATETIME(6)` upgrade —
 * so the resulting DDL is identical. Indexes are collected and applied after the
 * table is created (with the same expression-index / MySQL-length gating).
 */
class TableBuilder {
  readonly indexes: { columns: string | string[]; opts: IndexOpts }[] = [];

  constructor(
    private readonly t: TableDefinition,
    private readonly adapterName: string,
    private readonly typeMap: Record<string, string | undefined>,
    private readonly serialPk: string | null,
    private readonly compositePk: Set<string> | null,
  ) {}

  private col(name: string, primitive: string, o: ColOpts = {}): void {
    // The single-column integer PK is emitted inline at its declared offset,
    // preserving the declared INTEGER width across adapters (see serialIdType).
    if (name === this.serialPk) {
      this.t.column(name, serialIdType(primitive as ColumnSpec, this.adapterName), {
        primaryKey: true,
      });
      return;
    }
    const options: Record<string, unknown> = {};
    if (o.limit !== undefined) options["limit"] = o.limit;
    if (o.precision !== undefined) options["precision"] = o.precision;
    if (o.scale !== undefined) options["scale"] = o.scale;
    if (o.null !== undefined) options["null"] = o.null;
    if (o.defaultFunction !== undefined) {
      const fn = o.defaultFunction;
      options["default"] = () => fn;
    } else if (o.default !== undefined) {
      options["default"] = o.default;
    }
    // Composite-PK columns are NOT NULL (SQLite otherwise admits NULLs).
    if (this.compositePk?.has(name)) options["null"] = false;
    // MySQL DATETIME without precision = DATETIME(0); upgrade to DATETIME(6)
    // unless an explicit precision (incl. null) opted out.
    if (
      this.adapterName === "mysql" &&
      primitive === "datetime" &&
      options["precision"] === undefined
    ) {
      options["precision"] = 6;
    }
    const arType = this.typeMap[primitive] ?? primitive;
    this.t.column(name, arType, options);
  }

  string(name: string, o?: ColOpts): void {
    this.col(name, "string", o);
  }
  text(name: string, o?: ColOpts): void {
    this.col(name, "text", o);
  }
  integer(name: string, o?: ColOpts): void {
    this.col(name, "integer", o);
  }
  bigInteger(name: string, o?: ColOpts): void {
    this.col(name, "big_integer", o);
  }
  float(name: string, o?: ColOpts): void {
    this.col(name, "float", o);
  }
  decimal(name: string, o?: ColOpts): void {
    this.col(name, "decimal", o);
  }
  boolean(name: string, o?: ColOpts): void {
    this.col(name, "boolean", o);
  }
  datetime(name: string, o?: ColOpts): void {
    this.col(name, "datetime", o);
  }
  date(name: string, o?: ColOpts): void {
    this.col(name, "date", o);
  }
  time(name: string, o?: ColOpts): void {
    this.col(name, "time", o);
  }
  binary(name: string, o?: ColOpts): void {
    this.col(name, "binary", o);
  }
  json(name: string, o?: ColOpts): void {
    this.col(name, "json", o);
  }

  index(columns: string | string[], opts: IndexOpts = {}): void {
    this.indexes.push({ columns, opts });
  }
}

interface TableMeta {
  /** Suppress the implicit auto-increment `id` (Rails `create_table id: false`). */
  id?: false;
  /** Composite / non-`id` string PK (Rails `primary_key:` array form). */
  primaryKey?: string[];
  /** Single-column integer PK emitted inline as a serial (Rails `t.primary_key`). */
  serialPk?: string;
}

/**
 * Lay the canonical AR test schema onto a freshly-created (empty) database.
 * The template DB is built once at boot, so — unlike `defineSchema` — this
 * issues no drops, no signature-cache bookkeeping, and no schema-cache warming.
 */
export async function loadCanonicalSchema(adapter: DatabaseAdapter): Promise<void> {
  const { SchemaStatements } = await import("../connection-adapters/abstract/schema-statements.js");
  const withSs = adapter as unknown as {
    schemaStatements?: () => InstanceType<typeof SchemaStatements>;
  };
  const ss = withSs.schemaStatements ? withSs.schemaStatements() : new SchemaStatements(adapter);
  const typeMap =
    adapter.adapterName === "postgres"
      ? COLUMN_TYPE_MAP_PG
      : adapter.adapterName === "mysql"
        ? COLUMN_TYPE_MAP_MYSQL
        : COLUMN_TYPE_MAP_SQLITE;

  const define = async (
    name: string,
    meta: TableMeta,
    fn: (t: TableBuilder) => void,
  ): Promise<void> => {
    const createOpts: { id?: false; primaryKey?: string[] } = {};
    if (meta.id === false || meta.serialPk !== undefined || meta.primaryKey !== undefined) {
      createOpts.id = false;
    }
    if (meta.primaryKey !== undefined) createOpts.primaryKey = meta.primaryKey;
    const compositePk =
      meta.primaryKey !== undefined && meta.serialPk === undefined
        ? new Set(meta.primaryKey)
        : null;

    let builder!: TableBuilder;
    await ss.createTable(name, createOpts, (t: TableDefinition) => {
      builder = new TableBuilder(
        t,
        adapter.adapterName,
        typeMap,
        meta.serialPk ?? null,
        compositePk,
      );
      fn(builder);
    });

    for (const { columns, opts } of builder.indexes) {
      // Expression indexes (non-word chars) are gated on adapter support, and
      // sub-part length is MySQL-only — mirroring defineSchema / schema.rb.
      const isExpression = typeof columns === "string" && /\W/.test(columns);
      if (isExpression && !(await supportsExpressionIndex(adapter))) continue;
      const length = adapter.adapterName === "mysql" ? opts.length : undefined;
      await ss.addIndex(name, columns, {
        unique: opts.unique,
        where: opts.where,
        name: opts.name,
        order: opts.order as Record<string, string> | undefined,
        length,
        nullsNotDistinct: opts.nullsNotDistinct,
        using: opts.using,
        type: opts.type,
      });
    }
  };

  await define("1_need_quoting", {}, (t) => {
    t.string("name");
  });

  await define("accounts", {}, (t) => {
    t.integer("firm_id");
    t.string("firm_name");
    t.integer("credit_limit");
    t.string("status");
    t.datetime("updated_at");
  });

  await define("admin_accounts", {}, (t) => {
    t.string("name", { null: true });
  });

  await define("admin_regions", {}, (t) => {
    t.string("name");
  });

  await define("admin_users", {}, (t) => {
    t.string("name");
    t.integer("region_id");
    t.string("settings", { limit: 1024, null: true });
    t.string("parent", { limit: 1024, null: true });
    t.string("spouse", { limit: 1024, null: true });
    t.string("configs", { limit: 1024, null: true });
    t.string("preferences", { limit: 1024, null: true, default: "" });
    t.string("json_data", { limit: 1024, null: true });
    t.string("json_data_empty", { limit: 1024, null: true, default: "" });
    t.text("params");
    t.integer("account_id");
    t.json("json_options");
  });

  await define("admin_user_jsons", {}, (t) => {
    t.string("name");
    t.string("settings", { limit: 1024, null: true });
    t.string("parent", { limit: 1024, null: true });
    t.string("spouse", { limit: 1024, null: true });
    t.string("configs", { limit: 1024, null: true });
    t.string("preferences", { limit: 1024, null: true, default: "" });
    t.string("json_data", { limit: 1024, null: true });
    t.string("json_data_empty", { limit: 1024, null: true, default: "" });
    t.text("params");
    t.integer("account_id");
  });

  await define("aircraft", {}, (t) => {
    t.string("name");
    t.integer("wheels_count", { null: false, default: 0 });
    t.datetime("wheels_owned_at");
    t.datetime("manufactured_at", { precision: null, defaultFunction: "CURRENT_TIMESTAMP" });
  });

  await define("articles", {}, (t) => {});

  await define("articles_magazines", {}, (t) => {
    t.integer("article_id");
    t.integer("magazine_id");
  });

  await define("articles_tags", {}, (t) => {
    t.integer("article_id");
    t.integer("tag_id");
  });

  await define("attachments", {}, (t) => {
    t.integer("record_id", { null: false });
    t.string("record_type", { null: false });
  });

  await define("audit_logs", {}, (t) => {
    t.string("message", { null: false });
    t.integer("developer_id", { null: false });
    t.integer("unvalidated_developer_id");
  });

  await define("author_addresses", {}, (t) => {});

  await define("authors", {}, (t) => {
    t.string("name", { null: false });
    t.integer("author_address_id");
    t.integer("author_address_extra_id");
    t.string("organization_id");
    t.string("owned_essay_id");
  });

  await define("author_favorites", {}, (t) => {
    t.integer("author_id");
    t.integer("favorite_author_id");
  });

  await define("auto_id_tests", { serialPk: "auto_id" }, (t) => {
    t.integer("value");
    t.datetime("published_at", { precision: null, defaultFunction: "CURRENT_TIMESTAMP" });
    t.integer("auto_id");
  });

  await define("binaries", {}, (t) => {
    t.string("name");
    t.binary("data");
    t.binary("short_data", { limit: 2048 });
    t.binary("blob_data");
  });

  await define("birds", {}, (t) => {
    t.string("name");
    t.string("color");
    t.integer("pirate_id");
  });

  await define("books", {}, (t) => {
    t.integer("author_id");
    t.string("format");
    t.integer("format_record_id");
    t.string("format_record_type");
    t.string("name");
    t.integer("status", { default: 0 });
    t.integer("last_read", { default: 0 });
    t.integer("nullable_status");
    t.integer("language", { default: 0 });
    t.integer("author_visibility", { default: 0 });
    t.integer("illustrator_visibility", { default: 0 });
    t.integer("font_size", { default: 0 });
    t.integer("difficulty", { default: 0 });
    t.string("cover", { default: "hard" });
    t.string("isbn");
    t.string("external_id");
    t.string("original_name");
    t.datetime("published_on");
    t.boolean("boolean_status");
    t.integer("tags_count", { default: 0 });
    t.datetime("created_at");
    t.datetime("updated_at");
    t.date("updated_on");
    t.index(["author_id", "name"], { unique: true });
    t.index("isbn", { unique: true, where: "published_on IS NOT NULL" });
    t.index("(lower(external_id))", { unique: true });
  });

  await define("encrypted_books", {}, (t) => {
    t.integer("author_id");
    t.string("format");
    t.string("name", { limit: 1024, default: "<untitled>" });
    t.string("original_name");
    t.binary("logo");
    t.datetime("created_at");
    t.datetime("updated_at");
  });

  await define("hardbacks", {}, (t) => {});

  await define("booleans", {}, (t) => {
    t.boolean("value");
    t.boolean("has_fun", { null: false, default: false });
  });

  await define("branches", {}, (t) => {
    t.integer("branch_id");
  });

  await define("bulbs", { serialPk: "ID" }, (t) => {
    t.integer("ID");
    t.integer("car_id");
    t.string("name");
    t.boolean("frickinawesome", { default: false });
    t.string("color");
  });

  await define("CamelCase", {}, (t) => {
    t.string("name");
  });

  await define("cars", {}, (t) => {
    t.integer("person_id");
    t.string("name");
    t.integer("engines_count");
    t.integer("wheels_count", { null: false, default: 0 });
    t.datetime("wheels_owned_at");
    t.integer("bulbs_count");
    t.integer("custom_tyres_count");
    t.integer("lock_version", { null: false, default: 0 });
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });

  await define("old_cars", {}, (t) => {});

  await define("carriers", {}, (t) => {});

  await define("carts", { primaryKey: ["shop_id", "id"] }, (t) => {
    t.bigInteger("shop_id");
    t.bigInteger("id", { null: false });
    t.string("title");
  });

  await define("categories", {}, (t) => {
    t.string("name", { null: false });
    t.string("type");
    t.integer("categorizations_count");
  });

  await define("categories_posts", {}, (t) => {
    t.integer("category_id", { null: false });
    t.integer("post_id", { null: false });
  });

  await define("categorizations", {}, (t) => {
    t.integer("category_id");
    t.string("named_category_name");
    t.integer("post_id");
    t.integer("author_id");
    t.boolean("special");
  });

  await define("citations", {}, (t) => {
    t.bigInteger("book1_id");
    t.bigInteger("book2_id");
    t.bigInteger("citation_id");
    t.index("book1_id");
    t.index("book2_id");
    t.index("citation_id");
  });

  await define("cpk_books", { primaryKey: ["author_id", "id"] }, (t) => {
    t.integer("author_id");
    t.integer("id");
    t.string("title");
    t.integer("revision");
    t.integer("order_id");
    t.integer("shop_id");
  });

  await define("cpk_chapters", { primaryKey: ["author_id", "id"] }, (t) => {
    t.integer("author_id");
    t.integer("id");
    t.integer("book_id");
    t.string("title");
  });

  await define("cpk_authors", {}, (t) => {
    t.string("name");
  });

  await define("cpk_posts", { primaryKey: ["title", "author"] }, (t) => {
    t.string("title");
    t.string("author");
  });

  await define("cpk_comments", {}, (t) => {
    t.string("commentable_title");
    t.string("commentable_author");
    t.string("commentable_type");
    t.text("text");
  });

  await define("cpk_reviews", {}, (t) => {
    t.integer("author_id");
    t.integer("number");
    t.integer("rating");
    t.string("comment");
  });

  await define("cpk_orders", {}, (t) => {
    t.integer("shop_id");
    t.string("status");
    t.integer("books_count", { default: 0 });
  });

  await define("cpk_order_tags", { primaryKey: ["order_id", "tag_id"] }, (t) => {
    t.integer("order_id");
    t.integer("tag_id");
    t.string("attached_by");
    t.string("attached_reason");
  });

  await define("cpk_tags", {}, (t) => {
    t.string("name", { null: false });
  });

  await define("cpk_order_agreements", {}, (t) => {
    t.integer("order_id");
    t.string("signature");
  });

  await define("cpk_cars", { primaryKey: ["make", "model"] }, (t) => {
    t.string("make", { null: false });
    t.string("model", { null: false });
  });

  await define("cpk_car_reviews", {}, (t) => {
    t.string("car_make", { null: false });
    t.string("car_model", { null: false });
    t.text("comment");
    t.integer("rating");
  });

  await define("paragraphs", {}, (t) => {
    t.integer("book_id");
  });

  await define("clothing_items", {}, (t) => {
    t.string("clothing_type");
    t.string("color");
    t.string("type");
    t.string("size");
    t.text("description");
  });

  await define("sharded_blogs", {}, (t) => {
    t.string("name");
  });

  await define("sharded_blog_posts", {}, (t) => {
    t.string("title");
    t.integer("parent_id");
    t.string("parent_type");
    t.integer("blog_id");
    t.integer("revision");
  });

  await define("sharded_comments", {}, (t) => {
    t.string("body");
    t.integer("blog_post_id");
    t.integer("blog_id");
  });

  await define("sharded_tags", {}, (t) => {
    t.string("name");
    t.integer("blog_id");
  });

  await define("sharded_blog_posts_tags", {}, (t) => {
    t.integer("blog_id");
    t.integer("blog_post_id");
    t.integer("tag_id");
  });

  await define("clubs", {}, (t) => {
    t.string("name");
    t.integer("category_id");
  });

  await define("collections", {}, (t) => {
    t.string("name");
  });

  await define("colnametests", {}, (t) => {
    t.integer("references", { null: false });
  });

  await define("columns", {}, (t) => {
    t.integer("record_id");
  });

  await define("comments", {}, (t) => {
    t.integer("post_id", { null: false });
    t.text("body", { null: false });
    t.string("type");
    t.integer("label", { default: 0 });
    t.integer("tags_count", { default: 0 });
    t.integer("children_count", { default: 0 });
    t.integer("parent_id");
    t.integer("author_id");
    t.string("author_type");
    t.string("resource_id");
    t.string("resource_type");
    t.integer("origin_id");
    t.string("origin_type");
    t.integer("developer_id");
    t.datetime("updated_at");
    t.datetime("deleted_at");
    t.integer("comments");
    t.integer("company");
  });

  await define("comment_overlapping_counter_caches", {}, (t) => {
    t.integer("user_comments_count_id");
    t.integer("post_comments_count_id");
    t.integer("commentable_id");
    t.string("commentable_type");
  });

  await define("companies", {}, (t) => {
    t.string("type");
    t.integer("firm_id");
    t.string("firm_name");
    t.string("name");
    t.bigInteger("client_of");
    t.bigInteger("rating", { default: 1 });
    t.integer("account_id");
    t.string("description", { default: "" });
    t.integer("status", { default: 0 });
    t.index(["name", "rating"], { order: { name: "desc", rating: "desc" } });
    t.index(["name", "description"], { length: 10 });
    t.index(["firm_id", "type", "rating"], {
      name: "company_index",
      order: { rating: "desc" },
      length: { type: 10 },
    });
    t.index(["firm_id", "type"], { where: "(rating > 10)", name: "company_partial_index" });
    t.index(["firm_id"], { name: "company_nulls_not_distinct", nullsNotDistinct: true });
    t.index("name", { name: "company_name_index", using: "btree" });
    t.index("(CASE WHEN rating > 0 THEN lower(name) END) DESC", {
      name: "company_expression_index",
    });
  });

  await define("content", {}, (t) => {
    t.string("title");
    t.integer("book_id");
    t.integer("book_destroy_async_id");
  });

  await define("content_positions", {}, (t) => {
    t.integer("content_id");
  });

  await define("vegetables", {}, (t) => {
    t.string("name");
    t.integer("seller_id");
    t.string("custom_type");
  });

  await define("computers", {}, (t) => {
    t.string("system");
    t.integer("developer", { null: false });
    t.integer("extendedWarranty", { null: false });
    t.integer("timezone");
    t.datetime("created_at");
    t.datetime("updated_at");
  });

  await define("computers_developers", { id: false }, (t) => {
    t.integer("computer_id");
    t.integer("developer_id");
    t.datetime("created_at");
    t.datetime("updated_at");
  });

  await define("contracts", {}, (t) => {
    t.integer("developer_id");
    t.integer("company_id");
    t.string("metadata");
    t.integer("count");
  });

  await define("customers", {}, (t) => {
    t.string("name");
    t.integer("balance", { default: 0 });
    t.string("address_street");
    t.string("address_city");
    t.string("address_country");
    t.string("gps_location");
  });

  await define("customer_carriers", {}, (t) => {
    t.integer("customer_id");
    t.integer("carrier_id");
  });

  await define("dashboards", { id: false }, (t) => {
    t.string("dashboard_id");
    t.string("name");
  });

  await define("destroy_async_parents", { serialPk: "parent_id" }, (t) => {
    t.integer("parent_id");
    t.string("name");
    t.integer("tags_count", { default: 0 });
  });

  await define("destroy_async_parent_soft_deletes", {}, (t) => {
    t.integer("tags_count", { default: 0 });
    t.boolean("deleted");
  });

  await define("discounts", {}, (t) => {
    t.integer("amount");
  });

  await define("dl_keyed_belongs_tos", { serialPk: "belongs_key" }, (t) => {
    t.integer("belongs_key");
    t.integer("destroy_async_parent_id");
  });

  await define("dl_keyed_belongs_to_soft_deletes", {}, (t) => {
    t.integer("destroy_async_parent_soft_delete_id");
    t.boolean("deleted");
  });

  await define("dl_keyed_has_ones", { serialPk: "has_one_key" }, (t) => {
    t.integer("has_one_key");
    t.integer("destroy_async_parent_id");
    t.integer("destroy_async_parent_soft_delete_id");
  });

  await define("dl_keyed_has_manies", { serialPk: "many_key" }, (t) => {
    t.integer("many_key");
    t.integer("destroy_async_parent_id");
  });

  await define("dl_keyed_has_many_throughs", { serialPk: "through_key" }, (t) => {
    t.integer("through_key");
  });

  await define("dl_keyed_joins", { serialPk: "joins_key" }, (t) => {
    t.integer("joins_key");
    t.integer("destroy_async_parent_id");
    t.integer("dl_keyed_has_many_through_id");
  });

  await define("developers", {}, (t) => {
    t.string("name");
    t.string("first_name");
    t.integer("salary", { default: 70000 });
    t.integer("firm_id");
    t.integer("mentor_id");
    t.datetime("legacy_created_at");
    t.datetime("legacy_updated_at");
    t.datetime("legacy_created_on");
    t.datetime("legacy_updated_on");
  });

  await define("developers_projects", { id: false }, (t) => {
    t.integer("developer_id", { null: false });
    t.integer("project_id", { null: false });
    t.date("joined_on");
    t.integer("access_level", { default: 1 });
  });

  await define("dog_lovers", {}, (t) => {
    t.integer("trained_dogs_count", { default: 0 });
    t.integer("bred_dogs_count", { default: 0 });
    t.integer("dogs_count", { default: 0 });
  });

  await define("dogs", {}, (t) => {
    t.integer("trainer_id");
    t.integer("breeder_id");
    t.integer("dog_lover_id");
    t.string("alias");
  });

  await define("doubloons", {}, (t) => {
    t.integer("pirate_id");
    t.integer("weight");
  });

  await define("edges", { id: false }, (t) => {
    t.integer("source_id", { null: false });
    t.integer("sink_id", { null: false });
  });

  await define("editorships", {}, (t) => {
    t.string("publication_id");
    t.string("editor_id");
  });

  await define("editors", {}, (t) => {
    t.string("name");
  });

  await define("engines", {}, (t) => {
    t.bigInteger("car_id");
  });

  await define("entrants", {}, (t) => {
    t.string("name", { null: false });
    t.integer("course_id", { null: false });
  });

  await define("entries", {}, (t) => {
    t.string("entryable_type", { null: false });
    t.integer("entryable_id", { null: false });
    t.integer("account_id", { null: false });
    t.datetime("updated_at");
  });

  await define("essays", {}, (t) => {
    t.string("type");
    t.string("name");
    t.string("writer_id");
    t.string("writer_type");
    t.string("category_id");
    t.string("author_id");
    t.integer("book_id");
  });

  await define("events", {}, (t) => {
    t.string("title", { limit: 5 });
  });

  await define("eyes", {}, (t) => {});

  await define("families", {}, (t) => {});

  await define("family_trees", {}, (t) => {
    t.integer("family_id");
    t.integer("member_id");
    t.string("token");
  });

  await define("frogs", {}, (t) => {
    t.string("name");
  });

  await define("funny_jokes", {}, (t) => {
    t.string("name");
  });

  await define("cold_jokes", {}, (t) => {
    t.string("cold_name");
  });

  await define("friendships", {}, (t) => {
    t.integer("friend_id");
    t.integer("follower_id");
  });

  await define("goofy_string_id", { id: false }, (t) => {
    t.string("id", { null: false });
    t.string("info");
  });

  await define("having", {}, (t) => {
    t.string("where");
  });

  await define("guids", {}, (t) => {
    t.string("key");
  });

  await define("guitars", {}, (t) => {
    t.string("color");
  });

  await define("inept_wizards", {}, (t) => {
    t.string("name", { null: false });
    t.string("city", { null: false });
    t.string("type");
  });

  await define("integer_limits", {}, (t) => {
    t.integer("c_int_without_limit");
    t.integer("c_int_1", { limit: 1 });
    t.integer("c_int_2", { limit: 2 });
    t.integer("c_int_3", { limit: 3 });
    t.integer("c_int_4", { limit: 4 });
    t.integer("c_int_5", { limit: 5 });
    t.integer("c_int_6", { limit: 6 });
    t.integer("c_int_7", { limit: 7 });
    t.integer("c_int_8", { limit: 8 });
  });

  await define("invoices", {}, (t) => {
    t.integer("balance");
    t.datetime("updated_at");
  });

  await define("iris", {}, (t) => {
    t.integer("eye_id");
    t.string("color");
  });

  await define("items", {}, (t) => {
    t.string("name");
  });

  await define("jobs", {}, (t) => {
    t.integer("ideal_reference_id");
  });

  await define("jobs_pool", { id: false }, (t) => {
    t.integer("job_id", { null: false });
    t.integer("user_id", { null: false });
  });

  await define("keyboards", { serialPk: "key_number" }, (t) => {
    t.integer("key_number");
    t.string("name");
  });

  await define("kitchens", {}, (t) => {});

  await define("legacy_things", {}, (t) => {
    t.integer("tps_report_number");
    t.integer("version", { null: false, default: 0 });
  });

  await define("lessons", {}, (t) => {
    t.string("name");
  });

  await define("lessons_students", { id: false }, (t) => {
    t.bigInteger("lesson_id");
    t.bigInteger("student_id");
  });

  await define("students", {}, (t) => {
    t.string("name");
    t.boolean("active");
    t.integer("college_id");
  });

  await define("lint_models", {}, (t) => {});

  await define("line_items", {}, (t) => {
    t.integer("invoice_id");
    t.integer("amount");
  });

  await define("line_item_discount_applications", {}, (t) => {
    t.integer("line_item_id");
    t.integer("discount_id");
  });

  await define("lions", {}, (t) => {
    t.integer("gender");
    t.boolean("is_vegetarian", { default: false });
  });

  await define("lock_without_defaults", {}, (t) => {
    t.string("title");
    t.integer("lock_version");
    t.datetime("created_at", { null: true });
    t.datetime("updated_at", { null: true });
  });

  await define("lock_without_defaults_cust", {}, (t) => {
    t.string("title");
    t.integer("custom_lock_version");
    t.datetime("created_at", { null: true });
    t.datetime("updated_at", { null: true });
  });

  await define("magazines", {}, (t) => {});

  await define("mateys", { id: false }, (t) => {
    t.integer("pirate_id");
    t.integer("target_id");
    t.integer("weight");
  });

  await define("members", {}, (t) => {
    t.string("name");
    t.integer("member_type_id");
    t.integer("admittable_id");
    t.string("admittable_type");
  });

  await define("member_details", {}, (t) => {
    t.integer("member_id");
    t.integer("organization_id");
    t.string("extra_data");
  });

  await define("member_friends", { id: false }, (t) => {
    t.integer("member_id");
    t.integer("friend_id");
  });

  await define("memberships", {}, (t) => {
    t.datetime("joined_on");
    t.integer("club_id");
    t.integer("member_id");
    t.boolean("favorite", { default: false });
    t.integer("type");
    t.datetime("created_at");
    t.datetime("updated_at");
  });

  await define("member_types", {}, (t) => {
    t.string("name");
  });

  await define("mentors", {}, (t) => {
    t.string("name");
  });

  await define("messages", {}, (t) => {
    t.string("subject");
    t.datetime("updated_at");
  });

  await define("minivans", { id: false }, (t) => {
    t.string("minivan_id");
    t.string("name");
    t.string("speedometer_id");
    t.string("color");
  });

  await define("minimalistics", {}, (t) => {
    t.bigInteger("expires_at");
  });

  await define("mixed_case_monkeys", { serialPk: "monkeyID" }, (t) => {
    t.integer("monkeyID");
    t.integer("fleaCount");
  });

  await define("mixins", {}, (t) => {
    t.integer("parent_id");
    t.integer("pos");
    t.datetime("created_at");
    t.datetime("updated_at");
    t.integer("lft");
    t.integer("rgt");
    t.integer("root_id");
    t.string("type");
  });

  await define("mice", {}, (t) => {
    t.string("name");
  });

  await define("movies", { serialPk: "movieid" }, (t) => {
    t.integer("movieid");
    t.string("name");
  });

  await define("notifications", {}, (t) => {
    t.string("message");
  });

  await define("numeric_data", {}, (t) => {
    t.decimal("bank_balance", { precision: 10, scale: 2 });
    t.decimal("big_bank_balance", { precision: 15, scale: 2 });
    t.decimal("unscaled_bank_balance", { precision: 10 });
    t.decimal("world_population", { precision: 20, scale: 0 });
    t.decimal("my_house_population", { precision: 2, scale: 0 });
    t.decimal("decimal_number");
    t.decimal("decimal_number_with_default", { precision: 3, scale: 2, default: 2.78 });
    t.decimal("numeric_number");
    t.float("temperature");
    t.float("temperature_with_limit", { limit: 24 });
    t.decimal("decimal_number_big_precision", { precision: 20 });
    t.decimal("atoms_in_universe", { precision: 55, scale: 0 });
  });

  await define("orders", {}, (t) => {
    t.string("name");
    t.integer("billing_customer_id");
    t.integer("shipping_customer_id");
  });

  await define("organizations", {}, (t) => {
    t.string("name");
  });

  await define("owners", { serialPk: "owner_id" }, (t) => {
    t.integer("owner_id");
    t.string("name");
    t.datetime("updated_at");
    t.datetime("happy_at");
    t.string("essay_id");
  });

  await define("paint_colors", {}, (t) => {
    t.integer("non_poly_one_id");
  });

  await define("paint_textures", {}, (t) => {
    t.integer("non_poly_two_id");
  });

  await define("parrots", {}, (t) => {
    t.string("name");
    t.integer("breed", { default: 0 });
    t.string("color");
    t.string("parrot_sti_class");
    t.integer("killer_id");
    t.integer("updated_count", { default: 0 });
    t.datetime("created_at");
    t.datetime("created_on");
    t.datetime("updated_at");
    t.datetime("updated_on");
  });

  await define("pirates", {}, (t) => {
    t.string("catchphrase");
    t.integer("parrot_id");
    t.integer("non_validated_parrot_id");
    t.datetime("created_on");
    t.datetime("updated_on");
  });

  await define("treasures", {}, (t) => {
    t.string("name");
    t.string("type");
    t.integer("looter_id");
    t.string("looter_type");
    t.integer("ship_id");
  });

  await define("parrots_pirates", { id: false }, (t) => {
    t.integer("parrot_id");
    t.integer("pirate_id");
  });

  await define("parrots_treasures", { id: false }, (t) => {
    t.integer("parrot_id");
    t.integer("treasure_id");
  });

  await define("parrot_treasures", { id: false }, (t) => {
    t.integer("parrot_id");
    t.integer("treasure_id");
  });

  await define("people", {}, (t) => {
    t.string("first_name", { null: false });
    t.integer("primary_contact_id");
    t.string("gender", { limit: 1 });
    t.integer("number1_fan_id");
    t.integer("lock_version", { null: false, default: 0 });
    t.string("comments");
    t.integer("followers_count", { default: 0 });
    t.integer("friends_too_count", { default: 0 });
    t.integer("best_friend_id");
    t.integer("best_friend_of_id");
    t.integer("insures", { null: false, default: 0 });
    t.datetime("born_at");
    t.integer("cars_count", { default: 0 });
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });

  await define("peoples_treasures", { id: false }, (t) => {
    t.integer("rich_person_id");
    t.integer("treasure_id");
  });

  await define("personal_legacy_things", {}, (t) => {
    t.integer("tps_report_number");
    t.integer("person_id");
    t.integer("version", { null: false, default: 0 });
  });

  await define("pets", { serialPk: "pet_id" }, (t) => {
    t.integer("pet_id");
    t.string("name");
    t.integer("owner_id");
    t.integer("integer", { null: true });
    t.datetime("created_at");
    t.datetime("updated_at");
  });

  await define("pets_treasures", {}, (t) => {
    t.integer("treasure_id");
    t.integer("pet_id");
    t.string("rainbow_color");
  });

  await define("posts", {}, (t) => {
    t.integer("author_id");
    t.string("title", { null: false });
    t.text("body", { null: false });
    t.string("type");
    t.integer("legacy_comments_count", { default: 0 });
    t.integer("taggings_with_delete_all_count", { default: 0 });
    t.integer("taggings_with_destroy_count", { default: 0 });
    t.integer("tags_count", { default: 0 });
    t.integer("indestructible_tags_count", { default: 0 });
    t.integer("tags_with_destroy_count", { default: 0 });
    t.integer("tags_with_nullify_count", { default: 0 });
  });

  await define("postesques", {}, (t) => {
    t.string("author_name");
    t.string("author_id");
  });

  await define("post_comments_counts", {}, (t) => {
    t.integer("comments_count", { default: 0 });
  });

  await define("serialized_posts", {}, (t) => {
    t.integer("author_id");
    t.string("title", { null: false });
  });

  await define("images", {}, (t) => {
    t.integer("imageable_identifier");
    t.string("imageable_class");
  });

  await define("price_estimates", {}, (t) => {
    t.string("estimate_of_type");
    t.integer("estimate_of_id");
    t.integer("price");
    t.string("currency");
  });

  await define("products", {}, (t) => {
    t.integer("collection_id");
    t.integer("type_id");
    t.string("name");
    t.decimal("price");
    t.decimal("discounted_price");
  });

  await define("product_types", {}, (t) => {
    t.string("name");
  });

  await define("projects", {}, (t) => {
    t.string("name");
    t.string("type");
    t.integer("firm_id");
    t.integer("mentor_id");
  });

  await define("publications", {}, (t) => {
    t.string("name");
    t.integer("editor_in_chief_id");
  });

  await define("randomly_named_table1", {}, (t) => {
    t.string("some_attribute");
    t.integer("another_attribute");
  });

  await define("randomly_named_table2", {}, (t) => {
    t.string("some_attribute");
    t.integer("another_attribute");
  });

  await define("randomly_named_table3", {}, (t) => {
    t.string("some_attribute");
    t.integer("another_attribute");
  });

  await define("ratings", {}, (t) => {
    t.integer("comment_id");
    t.integer("value");
  });

  await define("readers", {}, (t) => {
    t.integer("post_id", { null: false });
    t.integer("person_id", { null: false });
    t.boolean("skimmer", { default: false });
    t.integer("first_post_id");
  });

  await define("references", {}, (t) => {
    t.integer("person_id");
    t.integer("job_id");
    t.boolean("favorite");
    t.integer("lock_version", { default: 0 });
  });

  await define("rooms", {}, (t) => {
    t.integer("user_id");
    t.integer("owner_id");
    t.integer("landlord_id");
    t.integer("tenant_id");
  });

  await define("seminars", {}, (t) => {
    t.string("name");
  });

  await define("sessions", {}, (t) => {
    t.date("start_date");
    t.date("end_date");
    t.string("name");
  });

  await define("sections", {}, (t) => {
    t.string("short_name");
    t.integer("session_id");
    t.integer("seminar_id");
  });

  await define("shape_expressions", {}, (t) => {
    t.string("paint_type");
    t.integer("paint_id");
    t.string("shape_type");
    t.integer("shape_id");
  });

  await define("shipping_lines", {}, (t) => {
    t.integer("invoice_id");
    t.integer("amount");
  });

  await define("shipping_line_discount_applications", {}, (t) => {
    t.integer("shipping_line_id");
    t.integer("discount_id");
  });

  await define("ships", {}, (t) => {
    t.string("name");
    t.integer("pirate_id");
    t.integer("developer_id");
    t.integer("update_only_pirate_id");
    t.integer("treasures_count", { default: 0 });
    t.datetime("created_at");
    t.datetime("created_on");
    t.datetime("updated_at");
    t.datetime("updated_on");
  });

  await define("ship_parts", {}, (t) => {
    t.string("name");
    t.integer("ship_id");
    t.datetime("updated_at");
  });

  await define("squeaks", {}, (t) => {
    t.integer("mouse_id");
  });

  await define("prisoners", {}, (t) => {
    t.integer("ship_id");
  });

  await define("sinks", {}, (t) => {
    t.integer("kitchen_id");
  });

  await define("shop_accounts", {}, (t) => {
    t.integer("customer_id");
    t.integer("customer_carrier_id");
  });

  await define("speedometers", { id: false }, (t) => {
    t.string("speedometer_id");
    t.string("name");
    t.string("dashboard_id");
  });

  await define("sponsors", {}, (t) => {
    t.integer("club_id");
    t.integer("sponsorable_id");
    t.string("sponsorable_type");
    t.integer("sponsor_id");
    t.string("sponsor_type");
  });

  await define("string_key_objects", { id: false }, (t) => {
    t.string("id", { null: false });
    t.string("name");
    t.integer("lock_version", { null: false, default: 0 });
    t.index("id", { unique: true });
  });

  await define("subscribers", { id: false }, (t) => {
    t.string("nick", { null: false });
    t.string("name");
    t.integer("id");
    t.integer("books_count", { null: false, default: 0 });
    t.integer("update_count", { null: false, default: 0 });
    t.index("nick", { unique: true });
  });

  await define("subscriptions", {}, (t) => {
    t.string("subscriber_id");
    t.integer("book_id");
  });

  await define("tags", {}, (t) => {
    t.string("name");
    t.integer("taggings_count", { default: 0 });
  });

  await define("taggings", {}, (t) => {
    t.integer("tag_id");
    t.integer("super_tag_id");
    t.string("taggable_type");
    t.integer("taggable_id");
    t.string("comment");
    t.string("type");
  });

  await define("tasks", {}, (t) => {
    t.datetime("starting");
    t.datetime("ending");
  });

  await define("topics", {}, (t) => {
    t.string("title", { limit: 250 });
    t.string("author_name");
    t.string("author_email_address");
    t.datetime("written_on");
    t.time("bonus_time");
    t.date("last_read");
    t.text("content");
    t.text("important");
    t.binary("binary_content");
    t.boolean("approved", { default: true });
    t.integer("replies_count", { default: 0 });
    t.integer("unique_replies_count", { default: 0 });
    t.integer("parent_id");
    t.string("parent_title");
    t.string("type");
    t.string("group");
    t.datetime("created_at", { null: true });
    t.datetime("updated_at", { null: true });
    t.index(["author_name", "title"]);
  });

  await define("toys", { serialPk: "toy_id" }, (t) => {
    t.integer("toy_id");
    t.string("name");
    t.integer("pet_id");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });

  await define("traffic_lights", {}, (t) => {
    t.string("location");
    t.string("state");
    t.text("long_state", { null: false });
    t.datetime("created_at");
    t.datetime("updated_at");
  });

  await define("translations", {}, (t) => {
    t.string("locale", { null: false });
    t.string("key", { null: false });
    t.string("value", { null: false });
    t.integer("attachment_id");
  });

  await define("tuning_pegs", {}, (t) => {
    t.integer("guitar_id");
    t.float("pitch");
  });

  await define("tyres", {}, (t) => {
    t.integer("car_id");
  });

  await define("unused_destroy_asyncs", {}, (t) => {});

  await define("unused_belongs_to", {}, (t) => {
    t.integer("unused_destroy_async_id");
  });

  await define("variants", {}, (t) => {
    t.integer("product_id");
    t.string("name");
  });

  await define("vertices", {}, (t) => {
    t.string("label");
  });

  await define("warehouse-things", {}, (t) => {
    t.integer("value");
  });

  await define("circles", {}, (t) => {});

  await define("squares", {}, (t) => {});

  await define("triangles", {}, (t) => {});

  await define("non_poly_ones", {}, (t) => {});

  await define("non_poly_twos", {}, (t) => {});

  await define("humans", {}, (t) => {
    t.string("name");
  });

  await define("faces", {}, (t) => {
    t.string("description");
    t.integer("human_id");
    t.integer("polymorphic_human_id");
    t.string("polymorphic_human_type");
    t.integer("poly_human_without_inverse_id");
    t.string("poly_human_without_inverse_type");
    t.integer("puzzled_polymorphic_human_id");
    t.string("puzzled_polymorphic_human_type");
    t.integer("super_human_id");
    t.string("super_human_type");
  });

  await define("interests", {}, (t) => {
    t.string("topic");
    t.integer("human_id");
    t.integer("polymorphic_human_id");
    t.string("polymorphic_human_type");
    t.integer("zine_id");
  });

  await define("zines", {}, (t) => {
    t.string("title");
  });

  await define("strict_zines", {}, (t) => {
    t.string("title");
  });

  await define("wheels", {}, (t) => {
    t.integer("size");
    t.integer("wheelable_id");
    t.string("wheelable_type");
  });

  await define("countries", { primaryKey: ["country_id"] }, (t) => {
    t.string("country_id");
    t.string("name");
  });

  await define("treaties", { primaryKey: ["treaty_id"] }, (t) => {
    t.string("treaty_id");
    t.string("name");
  });

  await define("countries_treaties", { primaryKey: ["country_id", "treaty_id"] }, (t) => {
    t.string("country_id", { null: false });
    t.string("treaty_id", { null: false });
  });

  await define("liquid", {}, (t) => {
    t.string("name");
  });

  await define("molecules", {}, (t) => {
    t.integer("liquid_id");
    t.string("name");
  });

  await define("electrons", {}, (t) => {
    t.integer("molecule_id");
    t.string("name");
  });

  await define("weirds", {}, (t) => {
    t.string("a$b");
    t.string("なまえ");
    t.string("from");
  });

  await define("nodes", {}, (t) => {
    t.integer("tree_id");
    t.integer("parent_id");
    t.string("name");
    t.datetime("updated_at");
  });

  await define("trees", {}, (t) => {
    t.string("name");
    t.datetime("updated_at");
  });

  await define("hotels", {}, (t) => {});

  await define("departments", {}, (t) => {
    t.integer("hotel_id");
  });

  await define("cake_designers", {}, (t) => {});

  await define("drink_designers", {}, (t) => {
    t.string("name");
  });

  await define("chefs", {}, (t) => {
    t.integer("employable_id");
    t.string("employable_type");
    t.integer("department_id");
    t.string("employable_list_type");
    t.integer("employable_list_id");
    t.datetime("created_at");
    t.datetime("updated_at");
  });

  await define("recipes", {}, (t) => {
    t.integer("chef_id");
    t.integer("hotel_id");
  });

  await define("recipients", {}, (t) => {
    t.integer("message_id");
    t.string("email_address");
  });

  await define("records", {}, (t) => {});

  await define("fk_test_has_pk", { serialPk: "pk_id" }, (t) => {
    t.integer("pk_id", { null: false });
  });

  await define("fk_test_has_fk", {}, (t) => {
    t.integer("fk_id", { null: false });
  });

  await define("fk_object_to_point_tos", {}, (t) => {});

  await define("fk_pointing_to_non_existent_objects", {}, (t) => {
    t.integer("fk_object_to_point_to_id", { null: false });
  });

  await define("overloaded_types", {}, (t) => {
    t.float("overloaded_float", { default: 500 });
    t.float("unoverloaded_float");
    t.string("overloaded_string_with_limit", { limit: 255 });
    t.string("string_with_default", { default: "the original default" });
    t.string("inferred_string", { limit: 255 });
    t.datetime("starts_at");
    t.datetime("ends_at");
  });

  await define("users", {}, (t) => {
    t.string("token");
    t.string("auth_token");
    t.string("password_digest");
    t.string("recovery_password_digest");
    t.datetime("created_at", { null: true });
    t.datetime("updated_at", { null: true });
  });

  await define("user_comments_counts", {}, (t) => {
    t.integer("comments_count", { default: 0 });
  });

  await define("test_with_keyword_column_name", {}, (t) => {
    t.string("desc");
  });

  await define("non_primary_keys", { id: false }, (t) => {
    t.integer("id");
    t.datetime("created_at");
  });

  await define("toooooooooooooooooooooooooooooooooo_long_table_names", {}, (t) => {
    t.bigInteger("toooooooo_long_a_id", { null: false });
    t.bigInteger("toooooooo_long_b_id", { null: false });
  });

  await define("courses", {}, (t) => {
    t.string("name", { null: false });
    t.integer("college_id");
  });

  await define("colleges", {}, (t) => {
    t.string("name", { null: false });
  });

  await define("professors", {}, (t) => {
    t.string("name", { null: false });
  });

  await define("courses_professors", { id: false }, (t) => {
    t.integer("course_id");
    t.integer("professor_id");
  });

  await define("to_be_linked_accounts", {}, (t) => {
    t.string("name");
  });

  await define("to_be_linked_users", {}, (t) => {
    t.string("name");
    t.integer("account_id");
    t.text("settings");
  });

  await define("group", {}, (t) => {
    t.string("order");
    t.integer("select_id");
  });

  await define("select", {}, (t) => {});

  await define("distinct", {}, (t) => {});

  await define("distinct_select", { id: false }, (t) => {
    t.integer("distinct_id");
    t.integer("select_id");
  });

  await define("values", { serialPk: "as" }, (t) => {
    t.integer("as");
    t.integer("group_id");
  });

  await define("appointments", {}, (t) => {
    t.integer("doctor_id");
    t.integer("patient_id");
  });

  await define("bookmarks", {}, (t) => {
    t.string("author_name");
  });

  await define("cat_categories", {}, (t) => {
    t.string("name");
  });

  await define("catalog_categories", {}, (t) => {
    t.string("name");
  });

  await define("catalog_products", {}, (t) => {
    t.string("name");
  });

  await define("children", {}, (t) => {
    t.integer("parent_id");
  });

  await define("clients", {}, (t) => {
    t.string("name");
  });

  await define("company2s", {}, (t) => {});

  await define("content_pages", {}, (t) => {
    t.string("name");
  });

  await define("contract2s", {}, (t) => {
    t.integer("company2_id");
  });

  await define("crews", {}, (t) => {
    t.integer("ship_id");
  });

  await define("doctors", {}, (t) => {});

  await define("essay_authors", {}, (t) => {
    t.string("name");
  });

  await define("essay_cats", {}, (t) => {
    t.string("name");
  });

  await define("essay_models", {}, (t) => {
    t.string("name");
    t.integer("writer_id");
    t.string("writer_type");
    t.integer("category_id");
  });

  await define("firms", {}, (t) => {
    t.string("name");
  });

  await define("habtm_posts", {}, (t) => {
    t.string("title");
  });

  await define("host_as", {}, (t) => {
    t.string("name");
  });

  await define("hot_accounts", {}, (t) => {
    t.integer("hot_owner_id");
  });

  await define("hot_owners", {}, (t) => {
    t.string("name");
  });

  await define("hot_profiles", {}, (t) => {
    t.integer("hot_account_id");
  });

  await define("jt_categories", {}, (t) => {
    t.string("name");
  });

  await define("jt_products", {}, (t) => {
    t.string("name");
  });

  await define("libraries", {}, (t) => {
    t.string("name");
  });

  await define("ms_departments", {}, (t) => {
    t.integer("hotel_id");
  });

  await define("ms_hotels", {}, (t) => {
    t.string("name");
  });

  await define("n_authors", {}, (t) => {
    t.string("name");
  });

  await define("n_categories", {}, (t) => {
    t.string("name");
  });

  await define("n_comments", {}, (t) => {
    t.integer("post_id");
  });

  await define("n_posts", {}, (t) => {
    t.integer("author_id");
  });

  await define("n_taggings", {}, (t) => {
    t.integer("post_id");
    t.integer("tag_id");
  });

  await define("n_tags", {}, (t) => {
    t.string("name");
  });

  await define("nested_nested_users", {}, (t) => {
    t.string("name");
  });

  await define("nested_users", {}, (t) => {
    t.string("name");
  });

  await define("no_pk_models", {}, (t) => {});

  await define("no_pk_owners", {}, (t) => {});

  await define("ns_admin_users", {}, (t) => {
    t.string("name");
  });

  await define("ns_billing_accounts", {}, (t) => {
    t.integer("firm_id");
  });

  await define("ns_billing_firms", {}, (t) => {
    t.string("name");
  });

  await define("ns_billing_nested_firms", {}, (t) => {
    t.string("name");
  });

  await define("ns_biz_clients", {}, (t) => {
    t.string("name");
    t.integer("firm_id");
  });

  await define("ns_biz_firms", {}, (t) => {
    t.string("name");
  });

  await define("ns_post_bs", {}, (t) => {
    t.string("name");
  });

  await define("ns_posts", {}, (t) => {
    t.string("name");
  });

  await define("ns_tag_bs", {}, (t) => {
    t.string("name");
  });

  await define("ns_tags", {}, (t) => {
    t.string("name");
  });

  await define("orgs", {}, (t) => {});

  await define("orphan2s", {}, (t) => {
    t.string("name");
  });

  await define("orphans", {}, (t) => {
    t.string("name");
  });

  await define("patients", {}, (t) => {});

  await define("post_tags", {}, (t) => {
    t.integer("post_id");
    t.integer("tag_id");
  });

  await define("profiles", {}, (t) => {
    t.integer("user_id");
  });

  await define("publishers", {}, (t) => {});

  await define("refl_authors", {}, (t) => {
    t.string("name");
  });

  await define("refl_categories", {}, (t) => {
    t.string("name");
  });

  await define("refl_essays", {}, (t) => {
    t.string("name");
    t.integer("writer_id");
    t.string("writer_type");
    t.integer("category_id");
  });

  await define("refl_organizations", {}, (t) => {
    t.string("name");
  });

  await define("sc2_chef_lists", {}, (t) => {
    t.integer("employable_list_id");
    t.string("employable_list_type");
    t.integer("employable_id");
    t.string("employable_type");
  });

  await define("sc2_hotels", {}, (t) => {
    t.string("name");
  });

  await define("sc2_mocktails", {}, (t) => {});

  await define("sc3_authors", {}, (t) => {
    t.string("name");
  });

  await define("sc3_books", {}, (t) => {
    t.integer("author_id");
    t.integer("format_record_id");
    t.string("format_record_type");
  });

  await define("sc3_hardbacks", {}, (t) => {});

  await define("sc4_chefs", {}, (t) => {
    t.integer("department_id");
    t.integer("employable_id");
    t.string("employable_type");
  });

  await define("sc4_depts", {}, (t) => {
    t.integer("hotel_id");
  });

  await define("sc4_drinks", {}, (t) => {});

  await define("sc4_hotels", {}, (t) => {
    t.string("name");
  });

  await define("sc4_recipes", {}, (t) => {
    t.integer("chef_id");
    t.integer("hotel_id");
  });

  await define("sc_cakes", {}, (t) => {});

  await define("sc_chefs", {}, (t) => {
    t.integer("department_id");
    t.integer("employable_id");
    t.string("employable_type");
  });

  await define("sc_depts", {}, (t) => {
    t.integer("hotel_id");
  });

  await define("sc_drinks", {}, (t) => {});

  await define("sc_hotels", {}, (t) => {
    t.string("name");
  });

  await define("special_books", {}, (t) => {
    t.string("isbn");
    t.integer("author_id");
  });

  await define("standalones", {}, (t) => {
    t.string("name");
  });

  await define("sub_books", {}, (t) => {
    t.string("title");
  });

  await define("target_as", {}, (t) => {
    t.string("name");
  });

  await define("targets", {}, (t) => {});

  await define("teams", {}, (t) => {});

  await define("tenants", {}, (t) => {
    t.integer("tenant_id");
  });

  await define("top_users", {}, (t) => {
    t.string("name");
  });

  await define("topic2s", {}, (t) => {
    t.string("title");
  });

  // create_table/drop_table clear the connection's prepared statements in Rails;
  // mirror that so PostgreSQL doesn't reuse a stale cached plan (0A000).
  (adapter as { clearCacheBang?: () => void }).clearCacheBang?.();
}
