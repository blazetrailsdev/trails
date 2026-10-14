import { StringIO } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";
import { Base } from "../../index.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const SCHEMA_NAME = "test_schema";
const SCHEMA2_NAME = "test_schema2";
const TABLE_NAME = "things";
const COLUMNS = [
  "id integer",
  "name character varying(50)",
  "email character varying(50)",
  "description character varying(100)",
  "name_vector tsvector",
  "moment timestamp without time zone default now()",
];

fixtures({}, { useTransactionalTests: false });

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let defaultSearchPath: string;

  beforeAll(async () => {
    defaultSearchPath = await (
      (await Base.leaseConnection()) as PostgreSQLAdapter
    ).schemaSearchPath();
  });
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });
  afterEach(async () => {
    await adapter.setSchemaSearchPath(defaultSearchPath);
    adapter.schemaCache.clearBang();
  });

  describe("SchemaTest", () => {
    const teardownSchemas = async () => {
      await adapter.dropSchema(SCHEMA2_NAME, { ifExists: true });
      await adapter.dropSchema(SCHEMA_NAME, { ifExists: true });
    };
    beforeEach(async () => {
      await teardownSchemas();
      await adapter.execute(
        `CREATE SCHEMA ${SCHEMA_NAME} CREATE TABLE ${TABLE_NAME} (${COLUMNS.join(",")})`,
      );
      await adapter.execute(
        `CREATE SCHEMA ${SCHEMA2_NAME} CREATE TABLE ${TABLE_NAME} (${COLUMNS.join(",")})`,
      );
      await adapter.execute(
        `CREATE INDEX a_index_things_on_name ON ${SCHEMA_NAME}.${TABLE_NAME} USING btree (name)`,
      );
    });
    afterEach(teardownSchemas);

    it("schema test 1", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      const cols = await adapter.columns(TABLE_NAME);
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("name");
      expect(colNames).toContain("email");
      expect(colNames).toContain("description");
      expect(colNames).toContain("moment");
    });

    it("schema test 2", async () => {
      const cols = await adapter.columns(`${SCHEMA_NAME}.${TABLE_NAME}`);
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("name");
      expect(colNames).toContain("email");
    });

    it("schema test 3", async () => {
      await adapter.setSchemaSearchPath(SCHEMA2_NAME);
      const cols = await adapter.columns(TABLE_NAME);
      const colNames = cols.map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("name");
    });

    it("column exists honors search path", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      expect(await adapter.tableExists(TABLE_NAME)).toBe(true);
      expect(await adapter.columnExists(TABLE_NAME, "name")).toBe(true);
      expect(await adapter.columnExists(TABLE_NAME, "email")).toBe(true);
      expect(await adapter.columnExists(TABLE_NAME, "nonexistent")).toBe(false);
    });

    it("indexes report their validity", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      const indexes = await adapter.indexes(TABLE_NAME);
      expect(indexes.length).toBeGreaterThan(0);
      expect(indexes.every((i) => i.valid === true)).toBe(true);
    });
  });

  describe("SchemaTableCommentTest", () => {
    afterEach(async () => {
      await adapter.dropTable("commented_table", { ifExists: true });
    });

    it("table comment is dumped and round-trips via createTable", async () => {
      await adapter.execute(
        `CREATE TABLE commented_table (id serial primary key, name varchar(50))`,
      );
      await adapter.execute(`COMMENT ON TABLE commented_table IS 'a test table'`);
      const lines = new StringIO();
      await adapter.createSchemaDumper({}).table("commented_table", lines);
      expect(lines.string()).toContain(`comment: "a test table"`);
      await adapter.execute(`DROP TABLE IF EXISTS commented_table`);

      const ss = adapter;
      await ss.createTable("commented_table", { comment: "a test table" }, (t) => {
        t.string("name");
      });
      expect(await adapter.tableComment("commented_table")).toBe("a test table");
    });
  });
});
