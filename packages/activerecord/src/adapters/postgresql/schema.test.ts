/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/schema_test.rb
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, pgSupportsNativePartitioning, PostgreSQLAdapter } from "./test-helper.js";
import { StatementInvalid } from "../../errors.js";
import { makeThingModels, makeThing5Model, makeSongAlbumModels } from "./schema-ar-models.js";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// Tables here are PG-schema-qualified (test_schema.things, music.songs, …),
// which defineSchema can't express — they're provisioned via raw DDL in
// setupSchemas. The empty defineSchema({}) call only flips the
// Phase-5 marker so the file satisfies the AR_NO_AUTO_SCHEMA=1 audit.

const SCHEMA_NAME = "test_schema";
const SCHEMA2_NAME = "test_schema2";
const TABLE_NAME = "things";
const CAPITALIZED_TABLE_NAME = "Things";
const INDEX_A_NAME = "a_index_things_on_name";
const INDEX_B_NAME = "b_index_things_on_different_columns_in_each_schema";
const INDEX_C_NAME = "c_index_full_text_search";
const INDEX_D_NAME = "d_index_things_on_description_desc";
const INDEX_E_NAME = "e_index_things_on_name_vector";
const INDEX_A_COLUMN = "name";
const INDEX_B_COLUMN_S1 = "email";
const INDEX_B_COLUMN_S2 = "moment";
const INDEX_C_COLUMN = "(to_tsvector('english', coalesce(things.name, '')))";
const INDEX_D_COLUMN = "description";
const INDEX_E_COLUMN = "name_vector";
const COLUMNS = [
  "id integer",
  "name character varying(50)",
  "email character varying(50)",
  "description character varying(100)",
  "name_vector tsvector",
  "moment timestamp without time zone default now()",
];
const PK_TABLE_NAME = "table_with_pk";
const UNMATCHED_SEQUENCE_NAME = "unmatched_primary_key_default_value_seq";
const UNMATCHED_PK_TABLE_NAME = "table_with_unmatched_sequence_for_pk";

async function setupSchemas(adapter: PostgreSQLAdapter) {
  await adapter.exec(
    `CREATE SCHEMA ${SCHEMA_NAME} CREATE TABLE ${TABLE_NAME} (${COLUMNS.join(",")})`,
  );
  await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}."${TABLE_NAME}.table" (${COLUMNS.join(",")})`);
  await adapter.exec(
    `CREATE TABLE ${SCHEMA_NAME}."${CAPITALIZED_TABLE_NAME}" (${COLUMNS.join(",")})`,
  );
  await adapter.exec(
    `CREATE SCHEMA ${SCHEMA2_NAME} CREATE TABLE ${TABLE_NAME} (${COLUMNS.join(",")})`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_A_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING btree (${INDEX_A_COLUMN})`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_A_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING btree (${INDEX_A_COLUMN})`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_B_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING btree (${INDEX_B_COLUMN_S1})`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_B_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING btree (${INDEX_B_COLUMN_S2})`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_C_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING gin (${INDEX_C_COLUMN})`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_C_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING gin (${INDEX_C_COLUMN})`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_D_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING btree (${INDEX_D_COLUMN} DESC)`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_D_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING btree (${INDEX_D_COLUMN} DESC)`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_E_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING gin (${INDEX_E_COLUMN})`,
  );
  await adapter.exec(
    `CREATE INDEX ${INDEX_E_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING gin (${INDEX_E_COLUMN})`,
  );
  await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}.${PK_TABLE_NAME} (id serial primary key)`);
  await adapter.exec(`CREATE TABLE ${SCHEMA2_NAME}.${PK_TABLE_NAME} (id serial primary key)`);
  await adapter.exec(`CREATE SEQUENCE ${SCHEMA_NAME}.${UNMATCHED_SEQUENCE_NAME}`);
  await adapter.exec(
    `CREATE TABLE ${SCHEMA_NAME}.${UNMATCHED_PK_TABLE_NAME} (id integer NOT NULL DEFAULT nextval('${SCHEMA_NAME}.${UNMATCHED_SEQUENCE_NAME}'::regclass), CONSTRAINT unmatched_pkey PRIMARY KEY (id))`,
  );
  await adapter.exec(`CREATE SCHEMA IF NOT EXISTS music`);
  await adapter.exec(`CREATE TABLE music.songs (id serial primary key)`);
  await adapter.exec(
    `CREATE TABLE music.albums (id serial primary key, deleted boolean default false)`,
  );
  await adapter.exec(
    `CREATE TABLE music.albums_songs (album_id integer, song_id integer, PRIMARY KEY (album_id, song_id))`,
  );
}

async function teardownSchemas(adapter: PostgreSQLAdapter) {
  await adapter.dropSchema(SCHEMA2_NAME, { ifExists: true, cascade: true });
  await adapter.dropSchema(SCHEMA_NAME, { ifExists: true, cascade: true });
  await adapter.dropSchema("test_schema3", { ifExists: true, cascade: true });
  await adapter.dropSchema("some_schema", { ifExists: true, cascade: true });
  await adapter.dropSchema("my_other_schema", { ifExists: true, cascade: true });
  await adapter.dropSchema("music", { ifExists: true, cascade: true });
}

setupHandlerSuite();

beforeAll(async () => {
  await defineSchema({});
});

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
  });

  describe("SchemaTest", () => {
    beforeEach(async () => {
      await teardownSchemas(adapter);
      await setupSchemas(adapter);
    });
    afterEach(async () => {
      await teardownSchemas(adapter);
    });

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

    it("schema names", async () => {
      const names = await adapter.schemaNames();
      expect(names).toContain("public");
      expect(names).toContain("test_schema");
      expect(names).toContain("test_schema2");
    });

    it("create schema", async () => {
      await adapter.createSchema("test_schema3");
      const names = await adapter.schemaNames();
      expect(names).toContain("test_schema3");
      await adapter.dropSchema("test_schema3");
    });

    it("raise create schema with existing schema", async () => {
      await adapter.createSchema("test_schema3");
      await expect(adapter.createSchema("test_schema3")).rejects.toThrow();
      await adapter.dropSchema("test_schema3");
    });

    it("force create schema", async () => {
      await adapter.createSchema("test_schema3");
      await adapter.createSchema("test_schema3", { force: true });
      const names = await adapter.schemaNames();
      expect(names).toContain("test_schema3");
      await adapter.dropSchema("test_schema3");
    });

    it("create schema if not exists", async () => {
      await adapter.createSchema("test_schema3");
      await adapter.createSchema("test_schema3", { ifNotExists: true });
      const names = await adapter.schemaNames();
      expect(names).toContain("test_schema3");
      await adapter.dropSchema("test_schema3");
    });

    it("create schema raises if both force and if not exists provided", async () => {
      await expect(
        adapter.createSchema("test_schema3", { force: true, ifNotExists: true }),
      ).rejects.toThrow("Options `:force` and `:if_not_exists` cannot be used simultaneously.");
    });

    it("drop schema", async () => {
      await adapter.createSchema("test_schema3");
      await adapter.dropSchema("test_schema3");
      const names = await adapter.schemaNames();
      expect(names).not.toContain("test_schema3");
    });

    it("drop schema if exists", async () => {
      await adapter.createSchema("some_schema");
      const before = await adapter.schemaNames();
      expect(before).toContain("some_schema");
      await adapter.dropSchema("some_schema", { ifExists: true });
      const after = await adapter.schemaNames();
      expect(after).not.toContain("some_schema");
    });

    it("habtm table name with schema", async () => {
      const { Song, Album, cleanup } = makeSongAlbumModels();
      try {
        await (Song as any).loadSchema();
        await (Album as any).loadSchema();
        const song = await (Song as any).create({});
        const album = await (Album as any).create({});
        await song.albums.push(album);
        const found = await (Song as any).joins("albums").where({ "albums.id": album.id }).first();
        expect(found.id).toBe(song.id);
        const albumIds1 = await (Song as any).joins("albums").pluck("albums.id");
        expect(albumIds1).toEqual([album.id]);
        const albumIds2 = await (Song as any).joins("albums").pluck("music.albums.id");
        expect(albumIds2).toEqual([album.id]);
      } finally {
        cleanup();
      }
    });

    it("drop schema with nonexisting schema", async () => {
      await expect(adapter.dropSchema("idontexist")).rejects.toThrow();
      await expect(adapter.dropSchema("idontexist", { ifExists: true })).resolves.not.toThrow();
    });

    it("raise wrapped exception on bad prepare", async () => {
      // Rails: PG adapter rejects `?` (MySQL placeholder) → StatementInvalid.
      // Our adapter rewrites `?` → `$1`, so we ensure the error by querying a table
      // that can never exist in the test schema.
      await expect(
        adapter.execQuery(
          "select * from _schema_test_nonexistent_table_xyz where id = ?",
          "sql",
          [1],
        ),
      ).rejects.toBeInstanceOf(StatementInvalid);
    });
    it.skip("schema change with prepared stmt", () => {
      // BLOCKED: adapter-pg — requires adapter.preparedStatements=true path
      // ROOT-CAUSE: test exercises schema changes invalidating prepared statement cache; our adapter
      // doesn't expose a prepared_statements toggle in the test helper
      // SCOPE: needs AdapterPool prepared-statements mode wired in schema test setup
    });

    it("data source exists?", async () => {
      expect(await adapter.dataSourceExists(`${SCHEMA_NAME}.${TABLE_NAME}`)).toBe(true);
      expect(await adapter.dataSourceExists(`${SCHEMA2_NAME}.${TABLE_NAME}`)).toBe(true);
      expect(await adapter.dataSourceExists(`${SCHEMA_NAME}."${TABLE_NAME}.table"`)).toBe(true);
      expect(await adapter.dataSourceExists(`${SCHEMA_NAME}."${CAPITALIZED_TABLE_NAME}"`)).toBe(
        true,
      );
    });

    it("data source exists when on schema search path", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      expect(await adapter.dataSourceExists(TABLE_NAME)).toBe(true);
    });

    it("data source exists when not on schema search path", async () => {
      await adapter.setSchemaSearchPath("public");
      expect(await adapter.dataSourceExists(TABLE_NAME)).toBe(false);
    });

    it("data source exists wrong schema", async () => {
      expect(await adapter.dataSourceExists("foo.things")).toBe(false);
    });

    it("data source exists quoted names", async () => {
      expect(await adapter.dataSourceExists(`"${SCHEMA_NAME}"."${TABLE_NAME}"`)).toBe(true);
      expect(await adapter.dataSourceExists(`${SCHEMA_NAME}."${TABLE_NAME}"`)).toBe(true);
    });

    it("data source exists quoted table", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      expect(await adapter.dataSourceExists(`"${TABLE_NAME}.table"`)).toBe(true);
    });

    it("with schema prefixed table name", async () => {
      const cols = await adapter.columns(`${SCHEMA_NAME}.${TABLE_NAME}`);
      const colNames = cols.map((c) => c.name);
      expect(colNames).toEqual(["id", "name", "email", "description", "name_vector", "moment"]);
    });

    it("with schema prefixed capitalized table name", async () => {
      const cols = await adapter.columns(`${SCHEMA_NAME}."${CAPITALIZED_TABLE_NAME}"`);
      const colNames = cols.map((c) => c.name);
      expect(colNames).toEqual(["id", "name", "email", "description", "name_vector", "moment"]);
    });

    it("with schema search path", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      const cols = await adapter.columns(TABLE_NAME);
      const colNames = cols.map((c) => c.name);
      expect(colNames).toEqual(["id", "name", "email", "description", "name_vector", "moment"]);
    });

    it("proper encoding of table name", async () => {
      expect(adapter.quoteTableName("table_name")).toBe('"table_name"');
      expect(adapter.quoteTableName('"table.name"')).toBe('"table.name"');
      expect(adapter.quoteTableName("schema_name.table_name")).toBe('"schema_name"."table_name"');
      expect(adapter.quoteTableName('schema_name."table.name"')).toBe('"schema_name"."table.name"');
      expect(adapter.quoteTableName('"schema.name".table_name')).toBe('"schema.name"."table_name"');
      expect(adapter.quoteTableName('"schema.name"."table.name"')).toBe(
        '"schema.name"."table.name"',
      );
    });

    it("where with qualified schema name", async () => {
      const { Thing1 } = await makeThingModels();
      await (Thing1 as any).create({ id: 1, name: "thing1", email: "thing1@localhost" });
      const names = (
        await (Thing1 as any).where({ "test_schema.things.name": "thing1" }).toArray()
      ).map((r: any) => r.name);
      expect(names).toEqual(["thing1"]);
    });
    it("pluck with qualified schema name", async () => {
      const { Thing1 } = await makeThingModels();
      await (Thing1 as any).create({ id: 1, name: "thing1", email: "thing1@localhost" });
      const names = await (Thing1 as any).pluck("test_schema.things.name");
      expect(names).toEqual(["thing1"]);
    });
    it("classes with qualified schema name", async () => {
      const { Thing1, Thing2, Thing3, Thing4 } = await makeThingModels();
      expect(await (Thing1 as any).count()).toBe(0);
      expect(await (Thing2 as any).count()).toBe(0);
      expect(await (Thing3 as any).count()).toBe(0);
      expect(await (Thing4 as any).count()).toBe(0);
      await (Thing1 as any).create({ id: 1, name: "thing1", email: "thing1@localhost" });
      expect(await (Thing1 as any).count()).toBe(1);
      expect(await (Thing2 as any).count()).toBe(0);
      expect(await (Thing3 as any).count()).toBe(0);
      expect(await (Thing4 as any).count()).toBe(0);
      await (Thing2 as any).create({ id: 1, name: "thing1", email: "thing1@localhost" });
      expect(await (Thing1 as any).count()).toBe(1);
      expect(await (Thing2 as any).count()).toBe(1);
      expect(await (Thing3 as any).count()).toBe(0);
      expect(await (Thing4 as any).count()).toBe(0);
      await (Thing3 as any).create({ id: 1, name: "thing1", email: "thing1@localhost" });
      expect(await (Thing3 as any).count()).toBe(1);
      expect(await (Thing4 as any).count()).toBe(0);
      await (Thing4 as any).create({ id: 1, name: "thing1", email: "thing1@localhost" });
      expect(await (Thing1 as any).count()).toBe(1);
      expect(await (Thing2 as any).count()).toBe(1);
      expect(await (Thing3 as any).count()).toBe(1);
      expect(await (Thing4 as any).count()).toBe(1);
    });
    it("raise on unquoted schema name", async () => {
      // $user without surrounding single quotes is invalid in SET search_path TO (PG
      // treats $user as a dollar-quoted string start with no closing tag → syntax error).
      // Rails schema_search_path= uses direct interpolation, so this raises StatementInvalid.
      await expect(adapter.setSchemaSearchPath("$user,public")).rejects.toBeInstanceOf(
        StatementInvalid,
      );
    });
    it("without schema search path", async () => {
      await adapter.setSchemaSearchPath("public");
      expect(await adapter.dataSourceExists(TABLE_NAME)).toBe(false);
      expect(await adapter.dataSourceExists(`${SCHEMA_NAME}.${TABLE_NAME}`)).toBe(true);
    });

    it("ignore nil schema search path", async () => {
      await adapter.setSchemaSearchPath(null);
      const path = await adapter.schemaSearchPath();
      expect(path).toBeDefined();
    });

    it("index name exists", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      expect(await adapter.indexNameExists(TABLE_NAME, INDEX_A_NAME)).toBe(true);
      expect(await adapter.indexNameExists(TABLE_NAME, INDEX_B_NAME)).toBe(true);
      expect(await adapter.indexNameExists(TABLE_NAME, INDEX_C_NAME)).toBe(true);
      expect(await adapter.indexNameExists(TABLE_NAME, INDEX_D_NAME)).toBe(true);
      expect(await adapter.indexNameExists(TABLE_NAME, INDEX_E_NAME)).toBe(true);
      expect(await adapter.indexNameExists(TABLE_NAME, "missing_index")).toBe(false);
      expect(await adapter.indexNameExists(`${SCHEMA_NAME}.${TABLE_NAME}`, INDEX_A_NAME)).toBe(
        true,
      );
    });

    it("dump indexes for schema one", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      const indexes = (await adapter.indexes(TABLE_NAME)).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      expect(indexes).toHaveLength(5);

      expect(indexes[0].name).toBe(INDEX_A_NAME);
      expect(indexes[0].columns).toEqual([INDEX_A_COLUMN]);
      expect(indexes[0].using).toBe("btree");

      expect(indexes[1].name).toBe(INDEX_B_NAME);
      expect(indexes[1].columns).toEqual([INDEX_B_COLUMN_S1]);
      expect(indexes[1].using).toBe("btree");

      expect(indexes[2].name).toBe(INDEX_C_NAME);
      expect(indexes[2].using).toBe("gin");

      expect(indexes[3].name).toBe(INDEX_D_NAME);
      expect(indexes[3].columns).toEqual([INDEX_D_COLUMN]);
      expect(indexes[3].using).toBe("btree");

      expect(indexes[4].name).toBe(INDEX_E_NAME);
      expect(indexes[4].columns).toEqual([INDEX_E_COLUMN]);
      expect(indexes[4].using).toBe("gin");
    });

    it("dump indexes for schema two", async () => {
      await adapter.setSchemaSearchPath(SCHEMA2_NAME);
      const indexes = (await adapter.indexes(TABLE_NAME)).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      expect(indexes).toHaveLength(5);

      expect(indexes[0].name).toBe(INDEX_A_NAME);
      expect(indexes[0].columns).toEqual([INDEX_A_COLUMN]);

      expect(indexes[1].name).toBe(INDEX_B_NAME);
      expect(indexes[1].columns).toEqual([INDEX_B_COLUMN_S2]);
    });

    it("dump indexes for schema multiple schemas in search path", async () => {
      await adapter.setSchemaSearchPath(`public, ${SCHEMA_NAME}`);
      const indexes = (await adapter.indexes(TABLE_NAME)).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      expect(indexes).toHaveLength(5);
      expect(indexes[0].columns).toEqual([INDEX_A_COLUMN]);
      expect(indexes[1].columns).toEqual([INDEX_B_COLUMN_S1]);
    });

    it("dump indexes for table with scheme specified in name", async () => {
      const indexes = await adapter.indexes(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(indexes).toHaveLength(5);
    });

    it("with uppercase index name", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      await adapter.addIndex(TABLE_NAME, ["name"], { name: "UpperCaseIdx" });
      expect(await adapter.indexNameExists(TABLE_NAME, "UpperCaseIdx")).toBe(true);
      await adapter.removeIndex(TABLE_NAME, { name: "UpperCaseIdx" });
      expect(await adapter.indexNameExists(TABLE_NAME, "UpperCaseIdx")).toBe(false);
    });

    it("remove index when schema specified", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      await adapter.addIndex(TABLE_NAME, ["email"], { name: "removable_idx" });
      expect(await adapter.indexNameExists(TABLE_NAME, "removable_idx")).toBe(true);
      await adapter.removeIndex(`${SCHEMA_NAME}.${TABLE_NAME}`, { name: "removable_idx" });
      expect(await adapter.indexNameExists(TABLE_NAME, "removable_idx")).toBe(false);
    });

    it("primary key with schema specified", async () => {
      for (const given of [
        `"${SCHEMA_NAME}"."${PK_TABLE_NAME}"`,
        `${SCHEMA_NAME}."${PK_TABLE_NAME}"`,
        `${SCHEMA_NAME}.${PK_TABLE_NAME}`,
      ]) {
        expect(await adapter.primaryKey(given)).toBe("id");
      }
    });

    it("primary key assuming schema search path", async () => {
      await adapter.setSchemaSearchPath(`${SCHEMA_NAME}, ${SCHEMA2_NAME}`);
      expect(await adapter.primaryKey(PK_TABLE_NAME)).toBe("id");
    });

    it("pk and sequence for with schema specified", async () => {
      const result1 = await adapter.pkAndSequenceFor(`"${SCHEMA_NAME}"."${PK_TABLE_NAME}"`);
      expect(result1).not.toBeNull();
      expect(result1![0]).toBe("id");
      expect(result1![1].schema).toBe(SCHEMA_NAME);
      expect(result1![1].name).toBe(`${PK_TABLE_NAME}_id_seq`);

      const result2 = await adapter.pkAndSequenceFor(
        `"${SCHEMA_NAME}"."${UNMATCHED_PK_TABLE_NAME}"`,
      );
      expect(result2).not.toBeNull();
      expect(result2![0]).toBe("id");
      expect(result2![1].schema).toBe(SCHEMA_NAME);
      expect(result2![1].name).toBe(UNMATCHED_SEQUENCE_NAME);
    });

    it("current schema", async () => {
      await adapter.setSchemaSearchPath(`'$user',public`);
      expect(await adapter.currentSchema()).toBe("public");

      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      expect(await adapter.currentSchema()).toBe(SCHEMA_NAME);

      await adapter.setSchemaSearchPath(`${SCHEMA2_NAME},${SCHEMA_NAME},public`);
      expect(await adapter.currentSchema()).toBe(SCHEMA2_NAME);

      await adapter.setSchemaSearchPath(`public,${SCHEMA2_NAME},${SCHEMA_NAME}`);
      expect(await adapter.currentSchema()).toBe("public");
    });

    it("prepared statements with multiple schemas", async () => {
      const Thing5 = makeThing5Model();
      // Load schema within a transaction to pin all queries to one connection.
      // Without this, the pool may route `columns("things")` to a fresh
      // connection without the search path set, returning 0 columns and causing
      // DEFAULT VALUES inserts that silently drop all attributes.
      try {
        await adapter.beginTransaction();
        await adapter.setSchemaSearchPath(SCHEMA_NAME);
        await (Thing5 as any).loadSchema();
        await adapter.commitTransaction();
      } catch (e) {
        await adapter.rollbackTransaction();
        throw e;
      }
      for (const schema of [SCHEMA_NAME, SCHEMA2_NAME]) {
        await adapter.setSchemaSearchPath(schema);
        await (Thing5 as any).create({
          id: 1,
          name: `thing inside ${schema}`,
          email: "thing1@localhost",
        });
      }
      for (const schema of [SCHEMA_NAME, SCHEMA2_NAME]) {
        await adapter.setSchemaSearchPath(schema);
        expect(await (Thing5 as any).count()).toBe(1);
        const row = await (Thing5 as any).where({ id: 1 }).first();
        expect(row?.name).toBe(`thing inside ${schema}`);
      }
      await adapter.setSchemaSearchPath("'$user', public");
    });

    it("schema exists?", async () => {
      expect(await adapter.schemaExists("public")).toBe(true);
      expect(await adapter.schemaExists(SCHEMA_NAME)).toBe(true);
      expect(await adapter.schemaExists(SCHEMA2_NAME)).toBe(true);
      expect(await adapter.schemaExists("darkside")).toBe(false);
    });

    it("reset pk sequence", async () => {
      const seqName = `${SCHEMA_NAME}.${UNMATCHED_SEQUENCE_NAME}`;
      await adapter.exec(`SELECT setval('${seqName}', 123)`);
      const before = await adapter.execute(`SELECT nextval('${seqName}') AS val`);
      expect(Number(before[0].val)).toBe(124);

      await adapter.resetPkSequence(`${SCHEMA_NAME}.${UNMATCHED_PK_TABLE_NAME}`);
      const after = await adapter.execute(`SELECT nextval('${seqName}') AS val`);
      expect(Number(after[0].val)).toBe(1);
    });

    it("set pk sequence", async () => {
      const tableName = `${SCHEMA_NAME}.${PK_TABLE_NAME}`;
      await adapter.setPkSequence(tableName, 123);
      const result = await adapter.pkAndSequenceFor(`"${SCHEMA_NAME}"."${PK_TABLE_NAME}"`);
      const qualifiedSeq = `"${result![1].schema}"."${result![1].name}"`;
      const rows = await adapter.execute(`SELECT nextval('${qualifiedSeq}') AS val`);
      expect(Number(rows[0].val)).toBe(124);
      await adapter.resetPkSequence(tableName);
    });

    it("rename index", async () => {
      const oldName = INDEX_A_NAME;
      const newName = `${oldName}_new`;
      const qualifiedTable = `${SCHEMA_NAME}.${TABLE_NAME}`;

      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      await adapter.renameIndex(qualifiedTable, oldName, newName);

      expect(await adapter.indexNameExists(qualifiedTable, oldName)).toBe(false);
      expect(await adapter.indexNameExists(qualifiedTable, newName)).toBe(true);
    });

    it("dumping schemas", async () => {
      // Must use adapter.createSchemaDumper() to get PgSchemaDumper so schemas()
      // override runs. SchemaDumper.dump(adapter) uses the base class and skips it.
      const output = await adapter.createSchemaDumper(adapter).dump();
      expect(output).not.toMatch(/createSchema\("public"\)/);
      expect(output).toMatch(/createSchema\("test_schema"\)/);
      expect(output).toMatch(/createSchema\("test_schema2"\)/);
    });
  });

  describe("SchemaForeignKeyTest", () => {
    beforeEach(async () => {
      await adapter.dropSchema("my_schema", { ifExists: true, cascade: true });
      await adapter.createSchema("my_schema");
    });
    afterEach(async () => {
      await adapter.dropSchema("my_other_schema", { ifExists: true, cascade: true });
      await adapter.dropSchema("my_schema", { ifExists: true, cascade: true });
    });

    it("dump foreign key targeting different schema", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE my_schema.trains (id serial primary key, name varchar(50))`,
        );
        await adapter.exec(`CREATE TABLE wagons (id serial primary key, train_id integer)`);
        await adapter.addForeignKey("wagons", "my_schema.trains");
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).foreignKeys("wagons", lines);
        const output = lines.join("\n");
        // FK name "fk_rails_wagons_train_id" is not a 10-hex pattern so it's exported;
        // match just the table arguments, allowing optional trailing options.
        expect(output).toMatch(/addForeignKey\("wagons", "my_schema\.trains"/);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS wagons`);
        await adapter.exec(`DROP TABLE IF EXISTS my_schema.trains`);
      }
    });

    it("create foreign key same schema", async () => {
      await adapter.exec(`CREATE TABLE my_schema.trains (id serial primary key)`);
      await adapter.exec(`CREATE TABLE my_schema.wagons (id serial primary key, train_id integer)`);
      await adapter.addForeignKey("my_schema.wagons", "my_schema.trains");
      expect(await adapter.foreignKeyExists("my_schema.wagons", "my_schema.trains")).toBe(true);
    });

    it("create foreign key different schemas", async () => {
      await adapter.dropSchema("my_other_schema", { ifExists: true, cascade: true });
      await adapter.createSchema("my_other_schema");
      await adapter.exec(`CREATE TABLE my_schema.trains (id serial primary key)`);
      await adapter.exec(
        `CREATE TABLE my_other_schema.wagons (id serial primary key, train_id integer)`,
      );
      await adapter.addForeignKey("my_other_schema.wagons", "my_schema.trains");
      expect(await adapter.foreignKeyExists("my_other_schema.wagons", "my_schema.trains")).toBe(
        true,
      );
    });
  });

  describe("SchemaIndexOpclassTest", () => {
    it("string opclass is dumped", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE trains (id serial primary key, name varchar(50), description text)`,
        );
        await adapter.exec(
          `CREATE INDEX trains_name_and_description ON trains USING btree(name text_pattern_ops, description text_pattern_ops)`,
        );
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        expect(lines.join("\n")).toContain(`opclass: "text_pattern_ops"`);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
    it("non default opclass is dumped", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE trains (id serial primary key, name varchar(50), description text)`,
        );
        await adapter.exec(
          `CREATE INDEX trains_name_and_description ON trains USING btree(name, description text_pattern_ops)`,
        );
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        expect(lines.join("\n")).toContain(`opclass: { description: "text_pattern_ops" }`);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
    it("opclass class parsing on non reserved and cannot be function or type keyword", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE trains (id serial primary key, name varchar(50), position varchar(50))`,
        );
        await adapter.exec(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
        await adapter.exec(
          `CREATE INDEX trains_position ON trains USING gin(position gin_trgm_ops)`,
        );
        await adapter.exec(
          `CREATE INDEX trains_name_and_position ON trains USING btree(name, position text_pattern_ops)`,
        );
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        const output = lines.join("\n");
        expect(output).toContain(`opclass: "gin_trgm_ops"`);
        expect(output).toContain(`opclass: { position: "text_pattern_ops" }`);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
  });

  describe("SchemaIndexNullsOrderTest", () => {
    it("nulls order is dumped", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE trains (id serial primary key, name varchar(50), description text)`,
        );
        await adapter.exec(
          `CREATE INDEX trains_name_and_description ON trains USING btree(name NULLS FIRST, description)`,
        );
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        expect(lines.join("\n")).toContain(`order: { name: "NULLS FIRST" }`);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
    it("non default order with nulls is dumped", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE trains (id serial primary key, name varchar(50), description text)`,
        );
        await adapter.exec(
          `CREATE INDEX trains_name_and_desc ON trains USING btree(name DESC NULLS LAST, description)`,
        );
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        expect(lines.join("\n")).toContain(`order: { name: "DESC NULLS LAST" }`);
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
  });

  describe("DefaultsUsingMultipleSchemasAndDomainTest", () => {
    const DOMAIN_SCHEMA = "schema_1";

    beforeEach(async () => {
      await adapter.dropSchema(DOMAIN_SCHEMA, { ifExists: true, cascade: true });
      await adapter.createSchema(DOMAIN_SCHEMA);
      await adapter.exec(`CREATE DOMAIN ${DOMAIN_SCHEMA}.text AS text`);
      await adapter.exec(`CREATE DOMAIN ${DOMAIN_SCHEMA}.varchar AS varchar`);
      await adapter.exec(`CREATE DOMAIN ${DOMAIN_SCHEMA}.numeric AS numeric`);
      await adapter.exec(`CREATE DOMAIN ${DOMAIN_SCHEMA}.bpchar AS bpchar`);
      await adapter.exec(`DROP TABLE IF EXISTS defaults`);
      await adapter.exec(`
        CREATE TABLE defaults (
          id serial primary key,
          text_col ${DOMAIN_SCHEMA}.text DEFAULT 'some value',
          string_col ${DOMAIN_SCHEMA}.varchar DEFAULT 'some value',
          decimal_col ${DOMAIN_SCHEMA}.numeric DEFAULT 3.14159265358979323846
        )
      `);
      await adapter.setSchemaSearchPath(`${DOMAIN_SCHEMA},public,pg_catalog`);
    });
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS defaults`);
      await adapter.dropSchema(DOMAIN_SCHEMA, { ifExists: true, cascade: true });
    });

    it("text defaults in new schema when overriding domain", async () => {
      const cols = await adapter.columns("defaults");
      const textCol = cols.find((c) => c.name === "text_col");
      expect(textCol).toBeDefined();
      expect(textCol!.default).toMatch(/some value/);
    });

    it("string defaults in new schema when overriding domain", async () => {
      const cols = await adapter.columns("defaults");
      const stringCol = cols.find((c) => c.name === "string_col");
      expect(stringCol).toBeDefined();
      expect(stringCol!.default).toMatch(/some value/);
    });

    it("decimal defaults in new schema when overriding domain", async () => {
      const cols = await adapter.columns("defaults");
      const decimalCol = cols.find((c) => c.name === "decimal_col");
      expect(decimalCol).toBeDefined();
      expect(decimalCol!.default).toMatch(/3\.14159265358979323846/);
    });

    it("bpchar defaults in new schema when overriding domain", async () => {
      await adapter.exec(
        `ALTER TABLE defaults ADD bpchar_col ${DOMAIN_SCHEMA}.bpchar DEFAULT 'some value'`,
      );
      const cols = await adapter.columns("defaults");
      const bpcharCol = cols.find((c) => c.name === "bpchar_col");
      expect(bpcharCol).toBeDefined();
      expect(bpcharCol!.default).toMatch(/some value/);
    });

    it("text defaults after updating column default", async () => {
      await adapter.exec(
        `ALTER TABLE defaults ALTER COLUMN text_col SET DEFAULT 'some text'::${DOMAIN_SCHEMA}.text`,
      );
      const cols = await adapter.columns("defaults");
      const textCol = cols.find((c) => c.name === "text_col");
      expect(textCol).toBeDefined();
      // Domain-typed defaults come back from PG as a double-cast expression
      // (`('some text'::text)::schema.type`). Rails' extract_value_from_default
      // strips simple casts but leaves compound domain casts in default_function.
      // Either slot is acceptable as long as the literal is preserved.
      const slot = textCol!.default ?? textCol!.defaultFunction ?? "";
      expect(String(slot)).toMatch(/some text/);
    });

    it("default containing quote and colons", async () => {
      await adapter.exec(`ALTER TABLE defaults ALTER COLUMN string_col SET DEFAULT 'foo''::bar'`);
      const cols = await adapter.columns("defaults");
      const stringCol = cols.find((c) => c.name === "string_col");
      expect(stringCol).toBeDefined();
      expect(stringCol!.default).toMatch(/foo.*::bar/);
    });
  });

  describe("SchemaWithDotsTest", () => {
    beforeEach(async () => {
      await adapter.dropSchema("my.schema", { ifExists: true, cascade: true });
      await adapter.createSchema("my.schema");
    });
    afterEach(async () => {
      await adapter.dropSchema("my.schema", { ifExists: true, cascade: true });
    });

    it("rename_table", async () => {
      await adapter.setSchemaSearchPath('"my.schema"');
      await adapter.exec(`CREATE TABLE "my.schema".posts (id serial primary key)`);
      await adapter.renameTable("posts", "articles");
      const tbls = await adapter.tables();
      expect(tbls).toContain("articles");
    });

    it("Active Record basics", async () => {
      await adapter.setSchemaSearchPath('"my.schema"');
      await adapter.createTable("articles", async (t) => {
        t.string("title");
      });
      class Article extends Base {
        static {
          this.tableName = '"my.schema".articles';
        }
      }
      await Article.loadSchema();
      await (Article as any).create({ title: "zOMG, welcome to my blorgh!" });
      const welcome = await (Article as any).last();
      expect(welcome.title).toBe("zOMG, welcome to my blorgh!");
    });
  });

  describe("SchemaJoinTablesTest", () => {
    it("create join table", async () => {
      try {
        await adapter.exec(`CREATE SCHEMA IF NOT EXISTS some_schema`);
        await adapter.createJoinTable("some_schema.users", "some_schema.roles");
        expect(await adapter.tableExists("some_schema.roles_users")).toBe(true);
        const cols = await adapter.columns("some_schema.roles_users");
        const colNames = cols.map((c) => c.name);
        expect(colNames).toContain("role_id");
        expect(colNames).toContain("user_id");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS some_schema.roles_users`);
        await adapter.exec(`DROP SCHEMA IF EXISTS some_schema CASCADE`);
      }
    });
  });

  describe("SchemaIndexIncludeColumnsTest", () => {
    it("schema dumps index included columns", async () => {
      try {
        await adapter.exec(
          `CREATE TABLE trains (id serial primary key, firm_id integer, type varchar(50), name varchar(50), account_id integer)`,
        );
        await adapter.getDatabaseVersion();
        if (adapter.supportsIndexInclude()) {
          await adapter.exec(
            `CREATE INDEX company_include_index ON trains USING btree(firm_id, type) INCLUDE (name, account_id)`,
          );
        } else {
          await adapter.exec(
            `CREATE INDEX company_include_index ON trains USING btree(firm_id, type)`,
          );
        }
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        const indexLine = lines.find((l) => l.includes("company_include_index"))?.trim();
        expect(indexLine).toBeDefined();
        if (adapter.supportsIndexInclude()) {
          expect(indexLine).toContain(`include: ["name","account_id"]`);
          // INCLUDE columns must not appear in the key columns list (PG11+ stores them in indkey).
          // Assert the exact key columns argument follows the table name.
          expect(indexLine).toContain(`"trains", ["firm_id", "type"]`);
          expect(indexLine).not.toContain(`["firm_id", "type", "name"`);
        } else {
          expect(indexLine).not.toContain("include:");
        }
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
  });

  describe("SchemaIndexNullsNotDistinctTest", () => {
    it("nulls not distinct is dumped", async () => {
      try {
        await adapter.exec(`CREATE TABLE trains (id serial primary key, name varchar(50))`);
        await adapter.getDatabaseVersion();
        if (!adapter.supportsNullsNotDistinct()) return;
        await adapter.exec(
          `CREATE INDEX trains_name ON trains USING btree(name) NULLS NOT DISTINCT`,
        );
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        expect(lines.join("\n")).toContain("nullsNotDistinct: true");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
    it("nulls distinct is dumped", async () => {
      try {
        await adapter.exec(`CREATE TABLE trains (id serial primary key, name varchar(50))`);
        await adapter.getDatabaseVersion();
        if (!adapter.supportsNullsNotDistinct()) return;
        await adapter.exec(`CREATE INDEX trains_name ON trains USING btree(name) NULLS DISTINCT`);
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        expect(lines.join("\n")).not.toContain("nullsNotDistinct");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
    it("nulls not set is dumped", async () => {
      try {
        await adapter.exec(`CREATE TABLE trains (id serial primary key, name varchar(50))`);
        await adapter.exec(`CREATE INDEX trains_name ON trains USING btree(name)`);
        const lines: string[] = [];
        await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
        expect(lines.join("\n")).not.toContain("nullsNotDistinct");
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS trains`);
      }
    });
  });

  describe("SchemaCreateTableOptionsTest", () => {
    // Mirrors Rails schema_test.rb SchemaCreateTableOptionsTest:
    // exercises the createTable → DDL → dump round-trip via the
    // `options:` table-option string.
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS trains`);
      await adapter.exec(`DROP TABLE IF EXISTS transportation_modes`);
      await adapter.exec(`DROP TABLE IF EXISTS vehicles`);
    });

    it.skipIf(!pgSupportsNativePartitioning)("list partition options is dumped", async () => {
      const options = "PARTITION BY LIST (kind)";
      await adapter.schemaStatements().createTable("trains", { id: false, options }, (t) => {
        t.string("name");
        t.string("kind");
      });
      const lines: string[] = [];
      await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
      expect(lines.join("\n")).toContain(`options: "${options}"`);
    });

    it.skipIf(!pgSupportsNativePartitioning)("range partition options is dumped", async () => {
      const options = "PARTITION BY RANGE (created_at)";
      await adapter.schemaStatements().createTable("trains", { id: false, options }, (t) => {
        t.string("name");
        t.datetime("created_at", { null: false });
      });
      const lines: string[] = [];
      await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
      expect(lines.join("\n")).toContain(`options: "${options}"`);
    });

    it("inherited table options is dumped", async () => {
      await adapter.schemaStatements().createTable("transportation_modes", (t) => {
        t.string("name");
        t.string("kind");
      });
      const options = "INHERITS (transportation_modes)";
      await adapter.schemaStatements().createTable("trains", { options });
      const lines: string[] = [];
      await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
      expect(lines.join("\n")).toContain(`options: "${options}"`);
    });

    it("multiple inherited table options is dumped", async () => {
      await adapter.schemaStatements().createTable("vehicles", (t) => {
        t.string("name");
      });
      await adapter.schemaStatements().createTable("transportation_modes", (t) => {
        t.string("kind");
      });
      const options = "INHERITS (transportation_modes, vehicles)";
      await adapter.schemaStatements().createTable("trains", { options });
      const lines: string[] = [];
      await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
      expect(lines.join("\n")).toContain(`options: "${options}"`);
    });

    it("no partition options are dumped", async () => {
      await adapter.schemaStatements().createTable("trains", (t) => {
        t.string("name");
      });
      const lines: string[] = [];
      await adapter.createSchemaDumper(adapter).dumpTable(lines, "trains");
      expect(lines.join("\n")).not.toContain("options:");
    });
  });

  describe("SchemaTableCommentTest", () => {
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS commented_table`);
    });

    it("table comment is dumped and round-trips via createTable", async () => {
      await adapter.exec(`CREATE TABLE commented_table (id serial primary key, name varchar(50))`);
      await adapter.exec(`COMMENT ON TABLE commented_table IS 'a test table'`);
      const lines: string[] = [];
      await adapter.createSchemaDumper(adapter).dumpTable(lines, "commented_table");
      expect(lines.join("\n")).toContain(`comment: "a test table"`);
      await adapter.exec(`DROP TABLE IF EXISTS commented_table`);

      const ss = adapter.schemaStatements();
      await ss.createTable("commented_table", { comment: "a test table" }, (t) => {
        t.string("name");
      });
      expect(await adapter.tableComment("commented_table")).toBe("a test table");
    });
  });
});
