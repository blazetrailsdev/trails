/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/schema_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlSchemaTest", () => {
    it.skip("schema test 1", async () => {});
    it.skip("schema test 2", async () => {});
    it.skip("schema test 3", async () => {});
    it.skip("schema names", () => {});
    it.skip("create schema", () => {});
    it.skip("raise create schema with existing schema", () => {});
    it.skip("force create schema", () => {});
    it.skip("create schema if not exists", () => {});
    it.skip("create schema raises if both force and if not exists provided", () => {});
    it.skip("drop schema", () => {});
    it.skip("drop schema if exists", () => {});
    it.skip("habtm table name with schema", () => {});
    it.skip("drop schema with nonexisting schema", () => {});
    it.skip("raise wrapped exception on bad prepare", () => {});
    it.skip("schema change with prepared stmt", () => {});
    it.skip("data source exists when on schema search path", () => {});
    it.skip("data source exists when not on schema search path", () => {});
    it.skip("data source exists quoted names", () => {});
    it.skip("data source exists quoted table", () => {});
    it.skip("with schema prefixed table name", () => {});
    it.skip("with schema prefixed capitalized table name", () => {});
    it.skip("with schema search path", () => {});
    it.skip("proper encoding of table name", () => {});
    it.skip("where with qualified schema name", () => {});
    it.skip("pluck with qualified schema name", () => {});
    it.skip("classes with qualified schema name", () => {});
    it.skip("raise on unquoted schema name", () => {});
    it.skip("without schema search path", () => {});
    it.skip("ignore nil schema search path", () => {});
    it.skip("index name exists", () => {});
    it.skip("dump indexes for schema one", () => {});
    it.skip("dump indexes for schema two", () => {});
    it.skip("dump indexes for schema multiple schemas in search path", () => {});
    it.skip("dump indexes for table with scheme specified in name", () => {});
    it.skip("with uppercase index name", () => {});
    it.skip("remove index when schema specified", () => {});
    it.skip("primary key with schema specified", () => {});
    it.skip("primary key assuming schema search path", () => {});
    it.skip("pk and sequence for with schema specified", () => {});
    it.skip("current schema", () => {});
    it.skip("prepared statements with multiple schemas", () => {});
    it.skip("schema exists?", () => {});
    it.skip("set pk sequence", () => {});
    it.skip("rename index", () => {});
    it.skip("dumping schemas", () => {});
    it.skip("dump foreign key targeting different schema", () => {});
    it.skip("create foreign key same schema", () => {});
    it.skip("create foreign key different schemas", () => {});
    it.skip("string opclass is dumped", () => {});
    it.skip("non default opclass is dumped", () => {});
    it.skip("opclass class parsing on non reserved and cannot be function or type keyword", () => {});
    it.skip("nulls order is dumped", () => {});
    it.skip("non default order with nulls is dumped", () => {});
    it.skip("text defaults in new schema when overriding domain", () => {});
    it.skip("string defaults in new schema when overriding domain", () => {});
    it.skip("decimal defaults in new schema when overriding domain", () => {});
    it.skip("bpchar defaults in new schema when overriding domain", () => {});
    it.skip("text defaults after updating column default", () => {});
    it.skip("default containing quote and colons", () => {});
    it.skip("rename_table", () => {});
    it.skip("Active Record basics", () => {});
    it.skip("create join table", () => {});
    it.skip("schema dumps index included columns", () => {});
    it.skip("nulls not distinct is dumped", () => {});
    it.skip("nulls distinct is dumped", () => {});
    it.skip("nulls not set is dumped", () => {});
    it.skip("list partition options is dumped", () => {});
    it.skip("range partition options is dumped", () => {});
    it.skip("inherited table options is dumped", () => {});
    it.skip("multiple inherited table options is dumped", () => {});
    it.skip("no partition options are dumped", () => {});
  });
  it.skip("data source exists?", () => {});

  it.skip("data source exists wrong schema", () => {});

  it.skip("reset pk sequence", async () => {});
});
