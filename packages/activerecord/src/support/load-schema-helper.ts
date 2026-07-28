import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { TableDefinition as MysqlTableDefinition } from "../connection-adapters/mysql/schema-definitions.js";
import type { TableDefinition as PgTableDefinition } from "../connection-adapters/postgresql/schema-definitions.js";
import type { AbstractMysqlAdapter } from "../connection-adapters/abstract-mysql-adapter.js";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { loadCanonicalSchema } from "./canonical-schema.js";

/**
 * The ported slice of
 * `vendor/rails/activerecord/test/schema/postgresql_specific_schema.rb` — the
 * `uuid-ossp` / `pgcrypto` extension header, the four uuid-primary-key tables,
 * `defaults` (lines 4-48), and the plain `create_table` remainder:
 * `postgresql_times`, `postgresql_oids`, `limitless_fields`, `bigint_array`,
 * the four `uuid_*` tables and the exclusion/unique constraint tables.
 *
 * Still unported: the `supports_identity_columns?` tables (50-66), the
 * `companies_nonstd_seq`/`setval` sequence pass and the partition +
 * `timestamp_with_zones` raw-DDL block (77-128), the `measurements*`
 * partitioned tables and `company_include_index` (187-201), and the
 * `supports_insert_returning?` trigger table (203-225).
 */
async function loadPostgresqlSpecificSchema(adapter: PostgreSQLAdapter): Promise<void> {
  // `supportsPgcryptoUuid()` / `supportsVirtualColumns()` read the cached
  // `databaseVersion`, whose sync getter throws until the version has been
  // fetched once.
  await adapter.getDatabaseVersion();

  await adapter.enableExtension("uuid-ossp");
  if (adapter.supportsPgcryptoUuid()) await adapter.enableExtension("pgcrypto");

  // `uuid_default = supports_pgcrypto_uuid? ? {} : { default: "uuid_generate_v4()" }`
  // (line 7), splatted into the three `id: :uuid` tables below. With pgcrypto the
  // adapter's own `gen_random_uuid()` PK default stands; without it that function
  // does not exist, so the PK falls back to uuid-ossp's `uuid_generate_v4()`.
  // The bare string (not a thunk) is Rails verbatim: quoteDefaultExpression emits
  // a `()`-bearing string unquoted on a uuid column.
  const uuidDefault: { default?: string } = adapter.supportsPgcryptoUuid()
    ? {}
    : { default: "uuid_generate_v4()" };

  await adapter.createTable("chat_messages", { id: "uuid", force: true, ...uuidDefault }, (t) => {
    (t as PgTableDefinition).text("content");
  });

  await adapter.createTable("chat_messages_custom_pk", { id: false, force: true }, (t) => {
    const pg = t as PgTableDefinition;
    pg.uuid("message_id", { primaryKey: true, default: "uuid_generate_v4()" });
    pg.text("content");
  });

  await adapter.createTable("uuid_parents", { id: "uuid", force: true, ...uuidDefault }, (t) => {
    (t as PgTableDefinition).string("name");
  });

  await adapter.createTable("uuid_children", { id: "uuid", force: true, ...uuidDefault }, (t) => {
    const pg = t as PgTableDefinition;
    pg.string("name");
    pg.uuid("uuid_parent_id");
  });

  await adapter.createTable("defaults", { force: true }, (t) => {
    const pg = t as PgTableDefinition;
    if (adapter.supportsVirtualColumns()) {
      pg.virtual("virtual_stored_number", {
        type: "integer",
        as: "random_number * 10",
        stored: true,
      });
    }
    pg.integer("random_number", { default: () => "random() * 100" });
    pg.string("ruby_on_rails", { default: () => "concat('Ruby ', 'on ', 'Rails')" });
    pg.date("modified_date", { default: () => "CURRENT_DATE" });
    pg.date("modified_date_function", { default: () => "now()" });
    pg.date("fixed_date", { default: "2004-01-01" });
    pg.datetime("modified_time", { default: () => "CURRENT_TIMESTAMP" });
    pg.datetime("modified_time_without_precision", {
      precision: null,
      default: () => "CURRENT_TIMESTAMP",
    });
    pg.datetime("modified_time_with_precision_0", {
      precision: 0,
      default: () => "CURRENT_TIMESTAMP",
    });
    pg.datetime("modified_time_function", { default: () => "now()" });
    pg.datetime("fixed_time", { default: "2004-01-01 00:00:00.000000-00" });
    pg.timestamptz("fixed_time_with_time_zone", { default: "2004-01-01 01:00:00+1" });
    pg.column("char1", "char(1)", { default: "Y" });
    pg.string("char2", { limit: 50, default: "a varchar field" });
    pg.text("char3", { default: "a text field" });
    pg.bigint("bigint_default", { default: () => "0::bigint" });
    pg.binary("binary_default_function", { default: () => "convert_to('A', 'UTF8')" });
    pg.text("multiline_default", { default: "--- []\n\n" });
  });

  await adapter.createTable("postgresql_times", { force: true }, (t) => {
    const pg = t as PgTableDefinition;
    pg.interval("time_interval");
    pg.interval("scaled_time_interval", { precision: 6 });
  });

  await adapter.createTable("postgresql_oids", { force: true }, (t) => {
    (t as PgTableDefinition).oid("obj_id");
  });

  await adapter.createTable("limitless_fields", { force: true }, (t) => {
    const pg = t as PgTableDefinition;
    pg.binary("binary", { limit: 100_000 });
    pg.text("text", { limit: 100_000 });
  });

  await adapter.createTable("bigint_array", { force: true }, (t) => {
    const pg = t as PgTableDefinition;
    pg.integer("big_int_data_points", { limit: 8, array: true });
    pg.decimal("decimal_array_default", { array: true, default: [1.23, 3.45] });
  });

  await adapter.createTable("uuid_comments", { force: true, id: false }, (t) => {
    const pg = t as PgTableDefinition;
    pg.uuid("uuid", { primaryKey: true, ...uuidDefault });
    pg.string("content");
  });

  await adapter.createTable("uuid_entries", { force: true, id: false }, (t) => {
    const pg = t as PgTableDefinition;
    pg.uuid("uuid", { primaryKey: true, ...uuidDefault });
    pg.string("entryable_type", { null: false });
    pg.uuid("entryable_uuid", { null: false });
  });

  await adapter.createTable("uuid_items", { force: true, id: false }, (t) => {
    const pg = t as PgTableDefinition;
    pg.uuid("uuid", { primaryKey: true, ...uuidDefault });
    pg.string("title");
  });

  await adapter.createTable("uuid_messages", { force: true, id: false }, (t) => {
    const pg = t as PgTableDefinition;
    pg.uuid("uuid", { primaryKey: true, ...uuidDefault });
    pg.string("subject");
  });

  await adapter.createTable("test_exclusion_constraints", { force: true }, (t) => {
    const pg = t as PgTableDefinition;
    pg.date("start_date");
    pg.date("end_date");
    pg.date("valid_from");
    pg.date("valid_to");
    pg.date("transaction_from");
    pg.date("transaction_to");

    pg.exclusionConstraint("daterange(start_date, end_date) WITH &&", {
      using: "gist",
      where: "start_date IS NOT NULL AND end_date IS NOT NULL",
      name: "test_exclusion_constraints_date_overlap",
    });
    pg.exclusionConstraint("daterange(valid_from, valid_to) WITH &&", {
      using: "gist",
      where: "valid_from IS NOT NULL AND valid_to IS NOT NULL",
      name: "test_exclusion_constraints_valid_overlap",
      deferrable: "immediate",
    });
    pg.exclusionConstraint("daterange(transaction_from, transaction_to) WITH &&", {
      using: "gist",
      where: "transaction_from IS NOT NULL AND transaction_to IS NOT NULL",
      name: "test_exclusion_constraints_transaction_overlap",
      deferrable: "deferred",
    });
  });

  await adapter.createTable("test_unique_constraints", { force: true }, (t) => {
    const pg = t as PgTableDefinition;
    pg.integer("position_1");
    pg.integer("position_2");
    pg.integer("position_3");
    pg.integer("position_4");

    pg.uniqueConstraint("position_1", {
      name: "test_unique_constraints_position_deferrable_false",
    });
    pg.uniqueConstraint("position_2", {
      name: "test_unique_constraints_position_deferrable_immediate",
      deferrable: "immediate",
    });
    pg.uniqueConstraint("position_3", {
      name: "test_unique_constraints_position_deferrable_deferred",
      deferrable: "deferred",
    });
    pg.uniqueConstraint("position_4", {
      name: "test_unique_constraints_position_nulls_not_distinct",
      nullsNotDistinct: true,
    });
  });
}

/**
 * Port of `vendor/rails/activerecord/test/schema/mysql2_specific_schema.rb`,
 * whole.
 *
 * `supports_default_expression?` is `adapter_helper.rb:23`, not an adapter
 * method: on the MySQL family it is MariaDB >= 10.2.1 or MySQL >= 8.0.13. It is
 * resolved here off the live connection rather than through
 * `support/supports.ts` because this module is also imported by the vitest
 * `globalSetup` entry point (template-global-setup.ts), which runs outside the
 * worker and so cannot pull in `supports.ts`'s `vitest` import.
 */
async function loadMysql2SpecificSchema(adapter: AbstractMysqlAdapter): Promise<void> {
  await adapter.getDatabaseVersion();
  const supportsDefaultExpression = adapter.isMariadb()
    ? adapter.databaseVersion.gte("10.2.1")
    : adapter.databaseVersion.gte("8.0.13");

  await adapter.createTable("datetime_defaults", { force: true }, (t) => {
    t.datetime("modified_datetime", { precision: null, default: () => "CURRENT_TIMESTAMP" });
    t.datetime("precise_datetime", { default: () => "CURRENT_TIMESTAMP(6)" });
    t.datetime("updated_datetime", {
      default: () => "CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)",
    });
  });

  await adapter.createTable("timestamp_defaults", { force: true }, (t) => {
    t.timestamp("nullable_timestamp");
    t.timestamp("modified_timestamp", { precision: null, default: () => "CURRENT_TIMESTAMP" });
    t.timestamp("precise_timestamp", { precision: 6, default: () => "CURRENT_TIMESTAMP(6)" });
    t.timestamp("updated_timestamp", {
      precision: 6,
      default: () => "CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)",
    });
  });

  await adapter.createTable("defaults", { force: true }, (t) => {
    const my = t as MysqlTableDefinition;
    my.date("fixed_date", { default: "2004-01-01" });
    my.datetime("fixed_time", { default: "2004-01-01 00:00:00" });
    my.column("char1", "char(1)", { default: "Y" });
    my.string("char2", { limit: 50, default: "a varchar field" });
    if (supportsDefaultExpression) {
      my.binary("uuid", { limit: 36, default: () => "(uuid())" });
      my.string("char2_concatenated", { default: () => "(concat(`char2`, '-'))" });
    }
  });

  await adapter.createTable("binary_fields", { force: true }, (t) => {
    const my = t as MysqlTableDefinition;
    my.binary("var_binary", { limit: 255 });
    my.binary("var_binary_large", { limit: 4095 });

    my.tinyblob("tiny_blob");
    my.blob("normal_blob");
    my.mediumblob("medium_blob");
    my.longblob("long_blob");
    my.tinytext("tiny_text");
    my.text("normal_text");
    my.mediumtext("medium_text");
    my.longtext("long_text");

    my.binary("tiny_blob_2", { size: "tiny" });
    my.binary("medium_blob_2", { size: "medium" });
    my.binary("long_blob_2", { size: "long" });
    my.text("tiny_text_2", { size: "tiny" });
    my.text("medium_text_2", { size: "medium" });
    my.text("long_text_2", { size: "long" });

    my.index(["var_binary"]);
  });

  await adapter.createTable(
    "key_tests",
    { force: true, options: "CHARSET=utf8 ENGINE=MyISAM" },
    (t) => {
      const my = t as MysqlTableDefinition;
      my.string("awesome");
      my.string("pizza");
      my.string("snacks");
      my.index(["awesome"], { type: "fulltext", name: "index_key_tests_on_awesome" });
      my.index(["pizza"], { using: "btree", name: "index_key_tests_on_pizza" });
      my.index(["snacks"], { name: "index_key_tests_on_snack" });
    },
  );

  await adapter.createTable("collation_tests", { id: false, force: true }, (t) => {
    const my = t as MysqlTableDefinition;
    my.string("string_cs_column", { limit: 1, collation: "utf8mb4_bin" });
    my.string("string_ci_column", { limit: 1, collation: "utf8mb4_general_ci" });
    my.binary("binary_column", { limit: 1 });
  });

  await adapter.execute("DROP PROCEDURE IF EXISTS ten");
  await adapter.execute("CREATE PROCEDURE ten() SQL SECURITY INVOKER\nBEGIN\n  SELECT 10;\nEND\n");

  await adapter.execute("DROP PROCEDURE IF EXISTS topics");
  await adapter.execute(
    "CREATE PROCEDURE topics(IN num INT) SQL SECURITY INVOKER\nBEGIN\n  SELECT * FROM topics LIMIT num;\nEND\n",
  );

  if (adapter.supportsInsertReturning()) {
    await adapter.createTable(
      "pk_autopopulated_by_a_trigger_records",
      { force: true, id: false },
      (t) => {
        (t as MysqlTableDefinition).integer("id", { null: false });
      },
    );

    await adapter.execute(
      "CREATE TRIGGER before_insert_trigger\n" +
        "BEFORE INSERT ON pk_autopopulated_by_a_trigger_records\n" +
        "FOR EACH ROW\n" +
        "SET NEW.id = (SELECT COALESCE(MAX(id), 0) + 1 FROM pk_autopopulated_by_a_trigger_records);\n",
    );
  }
}

/**
 * Port of `vendor/rails/activerecord/test/schema/sqlite_specific_schema.rb:3-22`
 * — the SQLite `defaults` table, the file's only content.
 */
async function loadSqliteSpecificSchema(adapter: DatabaseAdapter): Promise<void> {
  await adapter.createTable("defaults", { force: true }, (t) => {
    t.integer("random_number", { default: () => "ABS(RANDOM())" });
    t.string("ruby_on_rails", { default: () => "('Ruby ' || 'on ' || 'Rails')" });
    t.date("modified_date", { default: () => "CURRENT_DATE" });
    t.date("modified_date_function", { default: () => "DATE('now')" });
    t.date("fixed_date", { default: "2004-01-01" });
    t.datetime("modified_time", { default: () => "CURRENT_TIMESTAMP" });
    t.datetime("modified_time_without_precision", {
      precision: null,
      default: () => "CURRENT_TIMESTAMP",
    });
    t.datetime("modified_time_with_precision_0", {
      precision: 0,
      default: () => "CURRENT_TIMESTAMP",
    });
    t.datetime("modified_time_function", { default: () => "DATETIME('now')" });
    t.datetime("fixed_time", { default: "2004-01-01 00:00:00.000000-00" });
    t.column("char1", "char(1)", { default: "Y" });
    t.string("char2", { limit: 50, default: "a varchar field" });
    t.text("char3", { default: "a text field" });
    t.text("multiline_default", { default: "--- []\n\n" });
  });
}

/**
 * The `File.exist?(adapter_specific_schema_file)` lookup of
 * `load_schema_helper.rb:10,15`: an adapter name resolves to its
 * `<adapter>_specific_schema` loader when trails has one, and to nothing when it
 * does not.
 *
 * `sqlite_specific_schema.rb` and `mysql2_specific_schema.rb` are ported whole.
 * The postgres arm is still partial — the remaining tables of
 * `postgresql_specific_schema.rb:50-225` are owned by story
 * `port-postgresql-specific-schema-remainder`, not a claim that the gap does not
 * exist. `trilogy_specific_schema.rb` is the one genuine no-op: trails has no
 * Trilogy adapter, so no adapter name ever selects it.
 */
const ADAPTER_SPECIFIC_SCHEMAS: Record<string, (adapter: DatabaseAdapter) => Promise<void>> = {
  postgres: (adapter) => loadPostgresqlSpecificSchema(adapter as unknown as PostgreSQLAdapter),
  mysql: (adapter) => loadMysql2SpecificSchema(adapter as unknown as AbstractMysqlAdapter),
  sqlite: loadSqliteSpecificSchema,
};

/**
 * The tables each {@link ADAPTER_SPECIFIC_SCHEMAS} arm lays, by adapter name.
 * Must be kept in step with the loaders above — including their support gates,
 * which is why each arm resolves against the live adapter rather than being a
 * flat list.
 *
 * `support/drop-all-tables.ts` reads this: its between-test `reset` mode drops
 * every table that is not part of the loaded schema, and these are as much part
 * of the schema Rails boots with as `schema.rb`'s. Without them here the arm
 * would be undone before the first test in every file.
 */
const ADAPTER_SPECIFIC_TABLES: Record<
  string,
  (adapter: DatabaseAdapter) => Promise<readonly string[]>
> = {
  postgres: async () => [
    "chat_messages",
    "chat_messages_custom_pk",
    "uuid_parents",
    "uuid_children",
    "defaults",
    "postgresql_times",
    "postgresql_oids",
    "limitless_fields",
    "bigint_array",
    "uuid_comments",
    "uuid_entries",
    "uuid_items",
    "uuid_messages",
    "test_exclusion_constraints",
    "test_unique_constraints",
  ],
  mysql: async (adapter) => {
    // Same `supports_insert_returning?` gate the loader applies to
    // `pk_autopopulated_by_a_trigger_records` (mysql2_specific_schema.rb:84).
    // The version fetch mirrors the loader's, so a cold pool lease cannot
    // answer `false` on MariaDB and leave the table unshielded.
    await adapter.getDatabaseVersion();
    return [
      "datetime_defaults",
      "timestamp_defaults",
      "defaults",
      "binary_fields",
      "key_tests",
      "collation_tests",
      ...(adapter.supportsInsertReturning() ? ["pk_autopopulated_by_a_trigger_records"] : []),
    ];
  },
  sqlite: async () => ["defaults"],
};

/** The adapter-specific schema tables for `adapter`; empty when it has no arm. */
export async function adapterSpecificTableNames(
  adapter: DatabaseAdapter,
): Promise<readonly string[]> {
  return (await ADAPTER_SPECIFIC_TABLES[adapter.adapterName]?.(adapter)) ?? [];
}

/**
 * Port of `LoadSchemaHelper#load_schema`
 * (vendor/rails/activerecord/test/support/load_schema_helper.rb:4-21). The
 * control flow is complete; the *content* of the adapter-specific arm is not —
 * see {@link ADAPTER_SPECIFIC_SCHEMAS}. Arm by arm:
 *
 * - `load SCHEMA_ROOT + "/schema.rb"` → `loadCanonicalSchema`. trails' mirror of
 *   schema.rb is the canonical registry rather than a loadable Ruby file, so
 *   `load` means laying that registry onto the database.
 * - `load adapter_specific_schema_file if File.exist?(...)` →
 *   {@link ADAPTER_SPECIFIC_SCHEMAS}.
 * - `ActiveRecord::FixtureSet.reset_cache` (fixtures.rb:556) clears
 *   `@@all_cached_fixtures`, which Rails fills in `FixtureSet.create_fixtures`
 *   (fixtures.rb:611) so a re-loaded schema cannot be served rows built against
 *   the old one. trails' `FixtureSet.createFixtures` delegates straight to
 *   `defineFixtures`, which caches nothing, so the arm is empty here rather than
 *   unimplemented.
 * - Silencing `$stdout` has no counterpart: `load`ing a Ruby schema file prints
 *   every migration line, whereas laying the schema through the adapter prints
 *   nothing.
 *
 * @internal Boot/template setup paths only. Test files wire the canonical schema
 * + fixtures through `fixtures({ ... })`; the
 * `blazetrails/no-internal-canonical-loaders` ESLint rule enforces that.
 */
export async function loadSchema(adapter: DatabaseAdapter): Promise<void> {
  await loadCanonicalSchema(adapter);
  await loadAdapterSpecificSchema(adapter);
}

/**
 * The `load adapter_specific_schema_file if File.exist?(...)` arm of
 * `load_schema_helper.rb:15`, on its own.
 *
 * Exported because trails lays the canonical half through two different
 * mechanisms depending on the lane: {@link loadSchema} (the sqlite/PG template
 * build) and `DatabaseTasks.reconstructFromSchema`/`loadSchema` on the
 * generated schema file (`test-setup-dy.ts`, the per-worker DB every AR test
 * actually rides). The latter knows only about schema.rb's mirror and purges
 * whatever the template carried, so it has to call this arm itself — otherwise
 * the `<adapter>_specific_schema.rb` tables exist only in the template.
 *
 * @internal Boot/template setup paths only.
 */
export async function loadAdapterSpecificSchema(adapter: DatabaseAdapter): Promise<void> {
  const adapterSpecificSchema = ADAPTER_SPECIFIC_SCHEMAS[adapter.adapterName];
  if (adapterSpecificSchema) await adapterSpecificSchema(adapter);
}
