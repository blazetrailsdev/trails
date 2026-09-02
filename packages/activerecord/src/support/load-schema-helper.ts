import type {
  AbstractAdapter as DatabaseAdapter,
  AdapterName,
} from "../connection-adapters/abstract-adapter.js";
import type { AbstractMysqlAdapter } from "../connection-adapters/abstract-mysql-adapter.js";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { ActiveRecordError } from "../errors.js";
import { loadCanonicalSchema } from "./canonical-schema.js";
import { noteAdapterSpecificSchemaLoaded } from "./drop-all-tables.js";
import { STUBBED_DDL_METHODS } from "./stubbed-ddl-methods.js";

export async function createTestExclusionConstraintsTable(
  adapter: PostgreSQLAdapter,
): Promise<void> {
  await adapter.createTable("test_exclusion_constraints", { force: true }, (t) => {
    t.date("start_date");
    t.date("end_date");
    t.date("valid_from");
    t.date("valid_to");
    t.date("transaction_from");
    t.date("transaction_to");

    t.exclusionConstraint("daterange(start_date, end_date) WITH &&", {
      using: "gist",
      where: "start_date IS NOT NULL AND end_date IS NOT NULL",
      name: "test_exclusion_constraints_date_overlap",
    });
    t.exclusionConstraint("daterange(valid_from, valid_to) WITH &&", {
      using: "gist",
      where: "valid_from IS NOT NULL AND valid_to IS NOT NULL",
      name: "test_exclusion_constraints_valid_overlap",
      deferrable: "immediate",
    });
    t.exclusionConstraint("daterange(transaction_from, transaction_to) WITH &&", {
      using: "gist",
      where: "transaction_from IS NOT NULL AND transaction_to IS NOT NULL",
      name: "test_exclusion_constraints_transaction_overlap",
      deferrable: "deferred",
    });
  });
}

export async function createTestUniqueConstraintsTable(adapter: PostgreSQLAdapter): Promise<void> {
  await adapter.createTable("test_unique_constraints", { force: true }, (t) => {
    t.integer("position_1");
    t.integer("position_2");
    t.integer("position_3");
    t.integer("position_4");

    t.uniqueConstraint("position_1", {
      name: "test_unique_constraints_position_deferrable_false",
    });
    t.uniqueConstraint("position_2", {
      name: "test_unique_constraints_position_deferrable_immediate",
      deferrable: "immediate",
    });
    t.uniqueConstraint("position_3", {
      name: "test_unique_constraints_position_deferrable_deferred",
      deferrable: "deferred",
    });
    t.uniqueConstraint("position_4", {
      name: "test_unique_constraints_position_nulls_not_distinct",
      nullsNotDistinct: true,
    });
  });
}

async function loadPostgresqlSpecificSchema(adapter: PostgreSQLAdapter): Promise<void> {
  await adapter.enableExtension("uuid-ossp");
  if (await adapter.supportsPgcryptoUuid()) await adapter.enableExtension("pgcrypto");

  const uuidDefault: { default?: string } = (await adapter.supportsPgcryptoUuid())
    ? {}
    : { default: "uuid_generate_v4()" };

  await adapter.createTable("chat_messages", { id: "uuid", force: true, ...uuidDefault }, (t) => {
    t.text("content");
  });

  await adapter.createTable("chat_messages_custom_pk", { id: false, force: true }, (t) => {
    t.uuid("message_id", { primaryKey: true, default: "uuid_generate_v4()" });
    t.text("content");
  });

  await adapter.createTable("uuid_parents", { id: "uuid", force: true, ...uuidDefault }, (t) => {
    t.string("name");
  });

  await adapter.createTable("uuid_children", { id: "uuid", force: true, ...uuidDefault }, (t) => {
    t.string("name");
    t.uuid("uuid_parent_id");
  });

  const supportsVirtualColumns = await adapter.supportsVirtualColumns();
  await adapter.createTable("defaults", { force: true }, (t) => {
    if (supportsVirtualColumns) {
      t.virtual("virtual_stored_number", {
        type: "integer",
        as: "random_number * 10",
        stored: true,
      });
    }
    t.integer("random_number", { default: () => "random() * 100" });
    t.string("ruby_on_rails", { default: () => "concat('Ruby ', 'on ', 'Rails')" });
    t.date("modified_date", { default: () => "CURRENT_DATE" });
    t.date("modified_date_function", { default: () => "now()" });
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
    t.datetime("modified_time_function", { default: () => "now()" });
    t.datetime("fixed_time", { default: "2004-01-01 00:00:00.000000-00" });
    t.timestamptz("fixed_time_with_time_zone", { default: "2004-01-01 01:00:00+1" });
    t.column("char1", "char(1)", { default: "Y" });
    t.string("char2", { limit: 50, default: "a varchar field" });
    t.text("char3", { default: "a text field" });
    t.bigint("bigint_default", { default: () => "0::bigint" });
    t.binary("binary_default_function", { default: () => "convert_to('A', 'UTF8')" });
    t.text("multiline_default", { default: "--- []\n\n" });
  });

  if (await adapter.supportsIdentityColumns()) {
    await adapter.dropTable("postgresql_identity_table", { ifExists: true });
    await adapter.execute(
      "create table postgresql_identity_table (\n" +
        "  id INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY\n" +
        ")\n",
    );

    await adapter.dropTable("cpk_postgresql_identity_table", { ifExists: true });
    await adapter.execute(
      "create table cpk_postgresql_identity_table (\n" +
        "  another_id INT NOT NULL,\n" +
        "  id INT NOT NULL GENERATED BY DEFAULT AS IDENTITY,\n" +
        "  CONSTRAINT cpk_postgresql_identity_table_pkey PRIMARY KEY (another_id, id)\n" +
        ")\n",
    );
  }

  await adapter.createTable("postgresql_times", { force: true }, (t) => {
    t.interval("time_interval");
    t.interval("scaled_time_interval", { precision: 6 });
  });

  await adapter.createTable("postgresql_oids", { force: true }, (t) => {
    t.oid("obj_id");
  });

  await adapter.dropTable("postgresql_timestamp_with_zones", { ifExists: true });
  await adapter.dropTable("postgresql_partitioned_table", { ifExists: true });
  await adapter.dropTable("postgresql_partitioned_table_parent", { ifExists: true });

  await adapter.execute("DROP SEQUENCE IF EXISTS companies_nonstd_seq CASCADE");
  await adapter.execute("CREATE SEQUENCE companies_nonstd_seq START 101 OWNED BY companies.id");
  await adapter.execute(
    "ALTER TABLE companies ALTER COLUMN id SET DEFAULT nextval('companies_nonstd_seq')",
  );
  await adapter.execute("DROP SEQUENCE IF EXISTS companies_id_seq");

  await adapter.execute("DROP FUNCTION IF EXISTS partitioned_insert_trigger()");

  for (const seqName of [
    "accounts_id_seq",
    "developers_id_seq",
    "projects_id_seq",
    "topics_id_seq",
    "customers_id_seq",
    "orders_id_seq",
  ]) {
    await adapter.execute(`SELECT setval('${seqName}', 100)`);
  }

  await adapter.execute(
    "CREATE TABLE postgresql_timestamp_with_zones (\n" +
      "  id SERIAL PRIMARY KEY,\n" +
      "  time TIMESTAMP WITH TIME ZONE\n" +
      ")",
  );

  await adapter.execute(
    "CREATE TABLE postgresql_partitioned_table_parent (\n" +
      "  id SERIAL PRIMARY KEY,\n" +
      "  number integer\n" +
      ")",
  );
  await adapter.execute(
    "CREATE TABLE postgresql_partitioned_table ( )\n" +
      "  INHERITS (postgresql_partitioned_table_parent)",
  );
  await adapter.execute(
    "CREATE OR REPLACE FUNCTION partitioned_insert_trigger()\n" +
      "RETURNS TRIGGER AS $$\n" +
      "BEGIN\n" +
      "  INSERT INTO postgresql_partitioned_table VALUES (NEW.*);\n" +
      "  RETURN NULL;\n" +
      "END;\n" +
      "$$\n" +
      "LANGUAGE plpgsql",
  );
  await adapter.execute(
    "CREATE TRIGGER insert_partitioning_trigger\n" +
      "  BEFORE INSERT ON postgresql_partitioned_table_parent\n" +
      "  FOR EACH ROW EXECUTE PROCEDURE partitioned_insert_trigger()",
  );

  await adapter.createTable("limitless_fields", { force: true }, (t) => {
    t.binary("binary", { limit: 100_000 });
    t.text("text", { limit: 100_000 });
  });

  await adapter.createTable("bigint_array", { force: true }, (t) => {
    t.integer("big_int_data_points", { limit: 8, array: true });
    t.decimal("decimal_array_default", { array: true, default: [1.23, 3.45] });
  });

  await adapter.createTable("uuid_comments", { force: true, id: false }, (t) => {
    t.uuid("uuid", { primaryKey: true, ...uuidDefault });
    t.string("content");
  });

  await adapter.createTable("uuid_entries", { force: true, id: false }, (t) => {
    t.uuid("uuid", { primaryKey: true, ...uuidDefault });
    t.string("entryable_type", { null: false });
    t.uuid("entryable_uuid", { null: false });
  });

  await adapter.createTable("uuid_items", { force: true, id: false }, (t) => {
    t.uuid("uuid", { primaryKey: true, ...uuidDefault });
    t.string("title");
  });

  await adapter.createTable("uuid_messages", { force: true, id: false }, (t) => {
    t.uuid("uuid", { primaryKey: true, ...uuidDefault });
    t.string("subject");
  });

  await createTestExclusionConstraintsTable(adapter);

  await createTestUniqueConstraintsTable(adapter);

  if (await adapter.supportsPartitionedIndexes()) {
    await adapter.createTable(
      "measurements",
      { id: false, force: true, options: "PARTITION BY LIST (city_id)" },
      (t) => {
        t.string("city_id", { null: false });
        t.date("logdate", { null: false });
        t.integer("peaktemp");
        t.integer("unitsales");
        t.index(["logdate", "city_id"], { unique: true });
      },
    );
    await adapter.createTable("measurements_toronto", {
      id: false,
      force: true,
      options: "PARTITION OF measurements FOR VALUES IN (1)",
    });
    await adapter.createTable("measurements_concepcion", {
      id: false,
      force: true,
      options: "PARTITION OF measurements FOR VALUES IN (2)",
    });
  }

  await adapter.addIndex("companies", ["firm_id", "type"], {
    name: "company_include_index",
    include: ["name", "account_id"],
    ifNotExists: true,
  });

  if (await adapter.supportsInsertReturning()) {
    await adapter.createTable(
      "pk_autopopulated_by_a_trigger_records",
      { force: true, id: false },
      (t) => {
        t.integer("id", { null: false });
      },
    );

    await adapter.execute(
      "CREATE OR REPLACE FUNCTION populate_column()\n" +
        "RETURNS TRIGGER AS $$\n" +
        "DECLARE\n" +
        "  max_value INTEGER;\n" +
        "BEGIN\n" +
        "    SELECT MAX(id) INTO max_value FROM pk_autopopulated_by_a_trigger_records;\n" +
        "    NEW.id = COALESCE(max_value, 0) + 1;\n" +
        "    RETURN NEW;\n" +
        "END;\n" +
        "$$ LANGUAGE plpgsql;\n" +
        "\n" +
        "CREATE TRIGGER before_insert_trigger\n" +
        "BEFORE INSERT ON pk_autopopulated_by_a_trigger_records\n" +
        "FOR EACH ROW\n" +
        "EXECUTE FUNCTION populate_column();\n",
    );
  }
}

async function loadMysql2SpecificSchema(adapter: AbstractMysqlAdapter): Promise<void> {
  const databaseVersion = await adapter.databaseVersion;
  const supportsDefaultExpression = (await adapter.isMariadb())
    ? databaseVersion.compare("10.2.1") >= 0
    : databaseVersion.compare("8.0.13") >= 0;

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
    t.date("fixed_date", { default: "2004-01-01" });
    t.datetime("fixed_time", { default: "2004-01-01 00:00:00" });
    t.column("char1", "char(1)", { default: "Y" });
    t.string("char2", { limit: 50, default: "a varchar field" });
    if (supportsDefaultExpression) {
      t.binary("uuid", { limit: 36, default: () => "(uuid())" });
      t.string("char2_concatenated", { default: () => "(concat(`char2`, '-'))" });
    }
  });

  await adapter.createTable("binary_fields", { force: true }, (t) => {
    t.binary("var_binary", { limit: 255 });
    t.binary("var_binary_large", { limit: 4095 });

    t.tinyblob("tiny_blob");
    t.blob("normal_blob");
    t.mediumblob("medium_blob");
    t.longblob("long_blob");
    t.tinytext("tiny_text");
    t.text("normal_text");
    t.mediumtext("medium_text");
    t.longtext("long_text");

    t.binary("tiny_blob_2", { size: "tiny" });
    t.binary("medium_blob_2", { size: "medium" });
    t.binary("long_blob_2", { size: "long" });
    t.text("tiny_text_2", { size: "tiny" });
    t.text("medium_text_2", { size: "medium" });
    t.text("long_text_2", { size: "long" });

    t.index(["var_binary"]);
  });

  await adapter.createTable(
    "key_tests",
    { force: true, options: "CHARSET=utf8 ENGINE=MyISAM" },
    (t) => {
      t.string("awesome");
      t.string("pizza");
      t.string("snacks");
      t.index(["awesome"], { type: "fulltext", name: "index_key_tests_on_awesome" });
      t.index(["pizza"], { using: "btree", name: "index_key_tests_on_pizza" });
      t.index(["snacks"], { name: "index_key_tests_on_snack" });
    },
  );

  await adapter.createTable("collation_tests", { id: false, force: true }, (t) => {
    t.string("string_cs_column", { limit: 1, collation: "utf8mb4_bin" });
    t.string("string_ci_column", { limit: 1, collation: "utf8mb4_general_ci" });
    t.binary("binary_column", { limit: 1 });
  });

  await adapter.execute("DROP PROCEDURE IF EXISTS ten");
  await adapter.execute("CREATE PROCEDURE ten() SQL SECURITY INVOKER\nBEGIN\n  SELECT 10;\nEND\n");

  await adapter.execute("DROP PROCEDURE IF EXISTS topics");
  await adapter.execute(
    "CREATE PROCEDURE topics(IN num INT) SQL SECURITY INVOKER\nBEGIN\n  SELECT * FROM topics LIMIT num;\nEND\n",
  );

  if (await adapter.supportsInsertReturning()) {
    await adapter.createTable(
      "pk_autopopulated_by_a_trigger_records",
      { force: true, id: false },
      (t) => {
        t.integer("id", { null: false });
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

const ADAPTER_SPECIFIC_SCHEMAS: Record<AdapterName, (adapter: DatabaseAdapter) => Promise<void>> = {
  postgresql: (adapter) => loadPostgresqlSpecificSchema(adapter as unknown as PostgreSQLAdapter),
  mysql2: (adapter) => loadMysql2SpecificSchema(adapter as unknown as AbstractMysqlAdapter),
  sqlite3: loadSqliteSpecificSchema,
};

export async function loadSchema(adapter: DatabaseAdapter): Promise<void> {
  assertNotArmProbe(adapter);
  await loadCanonicalSchema(adapter);
  await loadAdapterSpecificSchema(adapter);
}

function assertNotArmProbe(adapter: DatabaseAdapter): void {
  for (const method of STUBBED_DDL_METHODS) assertNotStubbed(adapter, method);
}

function sameKind(seen: unknown, real: unknown): boolean {
  if (seen == null || real == null) return seen === real;
  return Object.getPrototypeOf(seen) === Object.getPrototypeOf(real);
}

function assertNotStubbed(adapter: DatabaseAdapter, method: string): void {
  const seen = (adapter as unknown as Record<string, unknown>)[method];
  for (
    let proto: object | null = Object.getPrototypeOf(adapter);
    proto !== null;
    proto = Object.getPrototypeOf(proto)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, method);
    if (!descriptor) continue;
    if (descriptor.get) {
      if (sameKind(seen, descriptor.get.call(adapter))) return;
    } else if (descriptor.value === seen) {
      return;
    }
    throw new ActiveRecordError(
      `loadSchema was handed an adapter whose ${method} is stubbed. The canonical ` +
        "half of the load would not really lay its tables; call " +
        "loadAdapterSpecificSchema directly to cover the adapter-specific arm.",
    );
  }
}

export async function loadAdapterSpecificSchema(adapter: DatabaseAdapter): Promise<void> {
  const adapterSpecificSchema = ADAPTER_SPECIFIC_SCHEMAS[adapter.typeRegistryKey];
  if (adapterSpecificSchema) {
    noteAdapterSpecificSchemaLoaded();
    await adapterSpecificSchema(adapter);
  }
}
