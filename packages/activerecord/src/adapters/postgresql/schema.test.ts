import { StringIO } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { itIfSupports } from "../../support/supports.js";
import { StatementInvalid } from "../../errors.js";
import { assertQueriesMatch } from "../../testing/query-assertions.js";
import { Name } from "../../connection-adapters/postgresql/utils.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { fixtures } from "../../test-fixtures.js";
import { dumpAllTableSchema, dumpTableSchema } from "../../support/schema-dumping-helper.js";
import type { SchemaSource } from "../../schema-dumper.js";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Base, registerModel, modelRegistry } from "../../index.js";
import { Default } from "../../test-helpers/models/default.js";
import { BigDecimal } from "@blazetrails/activesupport";

type ModelCtor = typeof Base;

async function makeThingModels(): Promise<{
  Thing1: ModelCtor;
  Thing2: ModelCtor;
  Thing3: ModelCtor;
  Thing4: ModelCtor;
}> {
  class Thing1 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}.things`;
    }
  }
  class Thing2 extends Base {
    static {
      this.tableName = `${SCHEMA2_NAME}.things`;
    }
  }
  class Thing3 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}."things.table"`;
    }
  }
  class Thing4 extends Base {
    static {
      this.tableName = `${SCHEMA_NAME}."Things"`;
    }
  }
  await Promise.all([Thing1, Thing2, Thing3, Thing4].map((M) => M.loadSchema()));
  return { Thing1, Thing2, Thing3, Thing4 };
}

function makeThing5Model(): ModelCtor {
  class Thing5 extends Base {
    static {
      this.tableName = "things";
    }
  }
  return Thing5 as unknown as ModelCtor;
}

function makeSongAlbumModels(): {
  Song: ModelCtor;
  Album: ModelCtor;
  cleanup: () => void;
} {
  class Song extends Base {
    declare albums: AssociationProxy<Album>;

    static {
      this.tableName = "music.songs";
      this.hasAndBelongsToMany("albums", { joinTable: "music.albums_songs" });
    }
  }
  class Album extends Base {
    static {
      this.tableName = "music.albums";
    }
  }
  registerModel("Song", Song);
  registerModel("Album", Album);
  return {
    Song: Song as unknown as ModelCtor,
    Album: Album as unknown as ModelCtor,
    cleanup: () => {
      modelRegistry.delete("Song");
      modelRegistry.delete("Album");
      modelRegistry.delete("Song::HABTM_Albums");
    },
  };
}

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

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
const PARTITIONED_TABLE = "measurements";
const PARTITIONED_TABLE_INDEX = "index_measurements_on_logdate_and_city_id";

async function setupSchemas(adapter: PostgreSQLAdapter) {
  await adapter.execute(
    `CREATE SCHEMA ${SCHEMA_NAME} CREATE TABLE ${TABLE_NAME} (${COLUMNS.join(",")})`,
  );
  await adapter.execute(`CREATE TABLE ${SCHEMA_NAME}."${TABLE_NAME}.table" (${COLUMNS.join(",")})`);
  await adapter.execute(
    `CREATE TABLE ${SCHEMA_NAME}."${CAPITALIZED_TABLE_NAME}" (${COLUMNS.join(",")})`,
  );
  await adapter.execute(
    `CREATE SCHEMA ${SCHEMA2_NAME} CREATE TABLE ${TABLE_NAME} (${COLUMNS.join(",")})`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_A_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING btree (${INDEX_A_COLUMN})`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_A_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING btree (${INDEX_A_COLUMN})`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_B_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING btree (${INDEX_B_COLUMN_S1})`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_B_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING btree (${INDEX_B_COLUMN_S2})`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_C_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING gin (${INDEX_C_COLUMN})`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_C_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING gin (${INDEX_C_COLUMN})`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_D_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING btree (${INDEX_D_COLUMN} DESC)`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_D_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING btree (${INDEX_D_COLUMN} DESC)`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_E_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} USING gin (${INDEX_E_COLUMN})`,
  );
  await adapter.execute(
    `CREATE INDEX ${INDEX_E_NAME} ON ${SCHEMA2_NAME}.${TABLE_NAME} USING gin (${INDEX_E_COLUMN})`,
  );
  await adapter.execute(`CREATE TABLE ${SCHEMA_NAME}.${PK_TABLE_NAME} (id serial primary key)`);
  await adapter.execute(`CREATE TABLE ${SCHEMA2_NAME}.${PK_TABLE_NAME} (id serial primary key)`);
  await adapter.execute(`CREATE SEQUENCE ${SCHEMA_NAME}.${UNMATCHED_SEQUENCE_NAME}`);
  await adapter.execute(
    `CREATE TABLE ${SCHEMA_NAME}.${UNMATCHED_PK_TABLE_NAME} (id integer NOT NULL DEFAULT nextval('${SCHEMA_NAME}.${UNMATCHED_SEQUENCE_NAME}'::regclass), CONSTRAINT unmatched_pkey PRIMARY KEY (id))`,
  );
  await adapter.execute(`CREATE SCHEMA IF NOT EXISTS music`);
  await adapter.execute(`CREATE TABLE music.songs (id serial primary key)`);
  await adapter.execute(
    `CREATE TABLE music.albums (id serial primary key, deleted boolean default false)`,
  );
  await adapter.execute(
    `CREATE TABLE music.albums_songs (album_id integer, song_id integer, PRIMARY KEY (album_id, song_id))`,
  );
}

async function teardownSchemas(adapter: PostgreSQLAdapter) {
  await adapter.execute(
    `DROP TABLE IF EXISTS music.songs, music.albums, music.albums_songs CASCADE`,
  );
  await adapter.dropSchema(SCHEMA2_NAME, { ifExists: true });
  await adapter.dropSchema(SCHEMA_NAME, { ifExists: true });
  await adapter.dropSchema("test_schema3", { ifExists: true });
  await adapter.dropSchema("some_schema", { ifExists: true });
  await adapter.dropSchema("my_other_schema", { ifExists: true });
  await adapter.dropSchema("music", { ifExists: true });
}

fixtures({}, { useTransactionalTests: false });

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let defaultSearchPath: string;

  const withSchemaSearchPath = async (
    schemaSearchPath: string | null,
    block?: () => Promise<void>,
  ) => {
    try {
      await adapter.setSchemaSearchPath(schemaSearchPath);
      adapter.schemaCache.clearBang();
      if (block) await block();
    } finally {
      await adapter.setSchemaSearchPath("'$user', public");
      adapter.schemaCache.clearBang();
    }
  };
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
    beforeEach(async () => {
      await teardownSchemas(adapter);
      await setupSchemas(adapter);
    });
    afterEach(async () => {
      await teardownSchemas(adapter);
    });

    const columns = async (tableName: string) =>
      (await adapter.columnDefinitions(tableName)).map(
        ([name, type, def]) => `${name} ${type}` + (def ? ` default ${def}` : ""),
      );

    const createPartitionedTable = () =>
      adapter.execute(
        `CREATE TABLE ${SCHEMA_NAME}."${PARTITIONED_TABLE}" (city_id integer not null, logdate date not null) PARTITION BY LIST (city_id)`,
      );

    const createPartitionedTableIndex = () =>
      adapter.execute(
        `CREATE INDEX ${PARTITIONED_TABLE_INDEX} ON ${SCHEMA_NAME}.${PARTITIONED_TABLE} (logdate, city_id)`,
      );

    const doDumpIndexAssertionsForOneIndex = (
      thisIndex: any,
      thisIndexName: string,
      thisIndexColumn: string,
    ) => {
      expect(thisIndex.table).toEqual(TABLE_NAME);
      expect(thisIndex.columns.length).toEqual(1);
      expect(thisIndex.columns[0]).toEqual(thisIndexColumn);
      expect(thisIndex.name).toEqual(thisIndexName);
    };

    const doDumpIndexTestsForSchema = async (
      thisSchemaName: string,
      firstIndexColumnName: string,
      secondIndexColumnName: string,
      thirdIndexColumnName: string,
      fourthIndexColumnName: string,
    ) => {
      await withSchemaSearchPath(thisSchemaName, async () => {
        const indexes = (await adapter.indexes(TABLE_NAME)).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        expect(indexes.length).toEqual(5);

        const [indexA, indexB, indexC, indexD, indexE] = indexes;

        doDumpIndexAssertionsForOneIndex(indexA, INDEX_A_NAME, firstIndexColumnName);
        doDumpIndexAssertionsForOneIndex(indexB, INDEX_B_NAME, secondIndexColumnName);
        doDumpIndexAssertionsForOneIndex(indexD, INDEX_D_NAME, thirdIndexColumnName);
        doDumpIndexAssertionsForOneIndex(indexE, INDEX_E_NAME, fourthIndexColumnName);

        expect(indexA.using).toEqual("btree");
        expect(indexB.using).toEqual("btree");
        expect(indexC.using).toEqual("gin");
        expect(indexD.using).toEqual("btree");
        expect(indexE.using).toEqual("gin");

        expect(indexD.orders).toEqual("desc");
      });
    };

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

    it("schema names", async () => {
      const schemaNames = await adapter.schemaNames();
      expect(schemaNames).toContain("public");
      expect(schemaNames).toContain("test_schema");
      expect(schemaNames).toContain("test_schema2");
      // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `assert_includes schema_names, "hint_plan" if @connection.supports_optimizer_hints?` (schema_test.rb:115)
      if (await adapter.supportsOptimizerHints()) expect(schemaNames).toContain("hint_plan");
    });

    it("create schema", async () => {
      try {
        await adapter.createSchema("test_schema3");
        expect((await adapter.schemaNames()).includes("test_schema3")).toBeTruthy();
      } finally {
        await adapter.dropSchema("test_schema3");
      }
    });

    it("raise create schema with existing schema", async () => {
      await adapter.createSchema("test_schema3");
      await expect(adapter.createSchema("test_schema3")).rejects.toThrow();
      await adapter.dropSchema("test_schema3");
    });

    it("force create schema", async () => {
      try {
        await adapter.createSchema("test_schema3");
        await assertQueriesMatch(
          /DROP SCHEMA IF EXISTS "test_schema3"/,
          undefined,
          false,
          async () => {
            await adapter.createSchema("test_schema3", { force: true });
          },
        );
        expect((await adapter.schemaNames()).includes("test_schema3")).toBeTruthy();
      } finally {
        await adapter.dropSchema("test_schema3");
      }
    });

    it("create schema if not exists", async () => {
      try {
        await adapter.createSchema("test_schema3");
        await assertQueriesMatch(
          /CREATE SCHEMA IF NOT EXISTS "test_schema3"/,
          undefined,
          false,
          async () => {
            await adapter.createSchema("test_schema3", { ifNotExists: true });
          },
        );
        expect((await adapter.schemaNames()).includes("test_schema3")).toBeTruthy();
      } finally {
        await adapter.dropSchema("test_schema3");
      }
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
        const found = await (Song as any).joins(":albums").where({ "albums.id": album.id }).first();
        expect(found.id).toBe(song.id);
        const albumIds1 = await (Song as any).joins(":albums").pluck("albums.id");
        expect(albumIds1).toEqual([album.id]);
        const albumIds2 = await (Song as any).joins(":albums").pluck("music.albums.id");
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
      await expect(
        adapter.execQuery("select * from developers where id = ?", "sql", [1]),
      ).rejects.toThrow(StatementInvalid);
    });
    it("schema change with prepared stmt", async () => {
      // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if ActiveRecord::Base.lease_connection.prepared_statements` (schema_test.rb:210)
      if (!adapter.preparedStatements) return;
      let altered = false;
      try {
        await expect(
          (async () => {
            await adapter.execQuery("select * from developers where id = $1", "sql", [1]);
            await adapter.execQuery("alter table developers add column zomg int", "sql", []);
            altered = true;
            await adapter.execQuery("select * from developers where id = $1", "sql", [1]);
          })(),
        ).resolves.not.toThrow();
      } finally {
        if (altered) {
          await adapter.execQuery("alter table developers drop column zomg", "sql", []);
        }
      }
    });

    it("data source exists?", async () => {
      const { Thing1, Thing2, Thing3, Thing4 } = await makeThingModels();
      for (const klass of [Thing1, Thing2, Thing3, Thing4]) {
        const name = klass.tableName;
        expect(
          await adapter.dataSourceExists(name),
          `'${name}' data_source should exist`,
        ).toBeTruthy();
      }
    });

    it("data source exists when on schema search path", async () => {
      await withSchemaSearchPath(SCHEMA_NAME, async () => {
        expect(
          await adapter.dataSourceExists(TABLE_NAME),
          "data_source should exist and be found",
        ).toBeTruthy();
      });
    });

    it("data source exists when not on schema search path", async () => {
      await withSchemaSearchPath("PUBLIC", async () => {
        expect(
          await adapter.dataSourceExists(TABLE_NAME),
          "data_source exists but should not be found",
        ).toBeFalsy();
      });
    });

    it("data source exists wrong schema", async () => {
      expect(
        await adapter.dataSourceExists("foo.things"),
        "data_source should not exist",
      ).toBeFalsy();
    });

    it("data source exists quoted names", async () => {
      for (const given of [
        `"${SCHEMA_NAME}"."${TABLE_NAME}"`,
        `${SCHEMA_NAME}."${TABLE_NAME}"`,
        `${SCHEMA_NAME}."${TABLE_NAME}"`,
      ]) {
        expect(
          await adapter.dataSourceExists(given),
          `data_source should exist when specified as ${given}`,
        ).toBeTruthy();
      }
      await withSchemaSearchPath(SCHEMA_NAME, async () => {
        const given = `"${TABLE_NAME}"`;
        expect(
          await adapter.dataSourceExists(given),
          `data_source should exist when specified as ${given}`,
        ).toBeTruthy();
      });
    });

    it("data source exists quoted table", async () => {
      await withSchemaSearchPath(SCHEMA_NAME, async () => {
        expect(
          await adapter.dataSourceExists('"things.table"'),
          "data_source should exist",
        ).toBeTruthy();
      });
    });

    it("with schema prefixed table name", async () => {
      await expect(
        (async () => {
          expect(await columns(`${SCHEMA_NAME}.${TABLE_NAME}`)).toEqual(COLUMNS);
        })(),
      ).resolves.not.toThrow();
    });

    it("with schema prefixed capitalized table name", async () => {
      await expect(
        (async () => {
          expect(await columns(`${SCHEMA_NAME}.${CAPITALIZED_TABLE_NAME}`)).toEqual(COLUMNS);
        })(),
      ).resolves.not.toThrow();
    });

    it("with schema search path", async () => {
      await expect(
        (async () => {
          await withSchemaSearchPath(SCHEMA_NAME, async () => {
            expect(await columns(TABLE_NAME)).toEqual(COLUMNS);
          });
        })(),
      ).resolves.not.toThrow();
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
      const { Thing1, Thing2, Thing3, Thing4 } = (await makeThingModels()) as Record<string, any>;
      expect(await Thing1.count()).toEqual(0);
      expect(await Thing2.count()).toEqual(0);
      expect(await Thing3.count()).toEqual(0);
      expect(await Thing4.count()).toEqual(0);

      await Thing1.create({ id: 1, name: "thing1", email: "thing1@localhost", moment: new Date() });
      expect(await Thing1.count()).toEqual(1);
      expect(await Thing2.count()).toEqual(0);
      expect(await Thing3.count()).toEqual(0);
      expect(await Thing4.count()).toEqual(0);

      await Thing2.create({ id: 1, name: "thing1", email: "thing1@localhost", moment: new Date() });
      expect(await Thing1.count()).toEqual(1);
      expect(await Thing2.count()).toEqual(1);
      expect(await Thing3.count()).toEqual(0);
      expect(await Thing4.count()).toEqual(0);

      await Thing3.create({ id: 1, name: "thing1", email: "thing1@localhost", moment: new Date() });
      expect(await Thing1.count()).toEqual(1);
      expect(await Thing2.count()).toEqual(1);
      expect(await Thing3.count()).toEqual(1);
      expect(await Thing4.count()).toEqual(0);

      await Thing4.create({ id: 1, name: "thing1", email: "thing1@localhost", moment: new Date() });
      expect(await Thing1.count()).toEqual(1);
      expect(await Thing2.count()).toEqual(1);
      expect(await Thing3.count()).toEqual(1);
      expect(await Thing4.count()).toEqual(1);
    });
    it("raise on unquoted schema name", async () => {
      await expect(withSchemaSearchPath("$user,public")).rejects.toThrow(StatementInvalid);
    });
    it("without schema search path", async () => {
      await expect(columns(TABLE_NAME)).rejects.toThrow(StatementInvalid);
    });

    it("ignore nil schema search path", async () => {
      await expect(withSchemaSearchPath(null)).resolves.not.toThrow();
    });

    it("index name exists", async () => {
      await withSchemaSearchPath(SCHEMA_NAME, async () => {
        expect(await adapter.indexNameExists(TABLE_NAME, INDEX_A_NAME)).toBeTruthy();
        expect(await adapter.indexNameExists(TABLE_NAME, INDEX_B_NAME)).toBeTruthy();
        expect(await adapter.indexNameExists(TABLE_NAME, INDEX_C_NAME)).toBeTruthy();
        expect(await adapter.indexNameExists(TABLE_NAME, INDEX_D_NAME)).toBeTruthy();
        expect(await adapter.indexNameExists(TABLE_NAME, INDEX_E_NAME)).toBeTruthy();
        expect(await adapter.indexNameExists(TABLE_NAME, INDEX_E_NAME)).toBeTruthy();
        expect(await adapter.indexNameExists(TABLE_NAME, "missing_index")).toBeFalsy();

        if (await adapter.supportsPartitionedIndexes()) {
          await createPartitionedTable();
          await createPartitionedTableIndex();
          expect(
            await adapter.indexNameExists(PARTITIONED_TABLE, PARTITIONED_TABLE_INDEX),
          ).toBeTruthy();
        }
      });

      expect(
        await adapter.indexNameExists(`${SCHEMA_NAME}.${TABLE_NAME}`, INDEX_A_NAME),
      ).toBeTruthy();
    });

    it("dump indexes for schema one", async () => {
      await doDumpIndexTestsForSchema(
        SCHEMA_NAME,
        INDEX_A_COLUMN,
        INDEX_B_COLUMN_S1,
        INDEX_D_COLUMN,
        INDEX_E_COLUMN,
      );
    });

    it("indexes report their validity", async () => {
      await adapter.setSchemaSearchPath(SCHEMA_NAME);
      const indexes = await adapter.indexes(TABLE_NAME);
      expect(indexes.length).toBeGreaterThan(0);
      expect(indexes.every((i) => i.valid === true)).toBe(true);
    });

    it("dump indexes for schema two", async () => {
      await doDumpIndexTestsForSchema(
        SCHEMA2_NAME,
        INDEX_A_COLUMN,
        INDEX_B_COLUMN_S2,
        INDEX_D_COLUMN,
        INDEX_E_COLUMN,
      );
    });

    it("dump indexes for schema multiple schemas in search path", async () => {
      await doDumpIndexTestsForSchema(
        `public, ${SCHEMA_NAME}`,
        INDEX_A_COLUMN,
        INDEX_B_COLUMN_S1,
        INDEX_D_COLUMN,
        INDEX_E_COLUMN,
      );
    });

    it("dump indexes for table with scheme specified in name", async () => {
      let indexes = await adapter.indexes(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(indexes.length).toEqual(5);

      // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if supports_partitioned_indexes?` (schema_test.rb:386)
      if (await adapter.supportsPartitionedIndexes()) {
        await createPartitionedTable();
        await createPartitionedTableIndex();
        indexes = await adapter.indexes(`${SCHEMA_NAME}.${PARTITIONED_TABLE}`);
        expect(indexes.length).toEqual(1);
      }
    });

    it("with uppercase index name", async () => {
      await adapter.execute(`CREATE INDEX "things_Index" ON ${SCHEMA_NAME}.things (name)`);

      await withSchemaSearchPath(SCHEMA_NAME, async () => {
        await expect(
          adapter.removeIndex("things", { name: "things_Index" }),
        ).resolves.not.toThrow();
      });

      // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if supports_partitioned_indexes?` (schema_test.rb:401)
      if (await adapter.supportsPartitionedIndexes()) {
        await createPartitionedTable();
        await adapter.execute(
          `CREATE INDEX "${PARTITIONED_TABLE}_Index" ON ${SCHEMA_NAME}.${PARTITIONED_TABLE} (logdate, city_id)`,
        );

        await withSchemaSearchPath(SCHEMA_NAME, async () => {
          await expect(
            adapter.removeIndex(PARTITIONED_TABLE, { name: `${PARTITIONED_TABLE}_Index` }),
          ).resolves.not.toThrow();
        });
      }
    });

    it("remove index when schema specified", async () => {
      await adapter.execute(`CREATE INDEX "things_Index" ON ${SCHEMA_NAME}.things (name)`);
      await expect(
        adapter.removeIndex("things", { name: `${SCHEMA_NAME}.things_Index` }),
      ).resolves.not.toThrow();

      await adapter.execute(`CREATE INDEX "things_Index" ON ${SCHEMA_NAME}.things (name)`);
      await expect(
        adapter.removeIndex(`${SCHEMA_NAME}.things`, { name: "things_Index" }),
      ).resolves.not.toThrow();

      await adapter.execute(`CREATE INDEX "things_Index" ON ${SCHEMA_NAME}.things (name)`);
      await expect(
        adapter.removeIndex(`${SCHEMA_NAME}.things`, { name: `${SCHEMA_NAME}.things_Index` }),
      ).resolves.not.toThrow();

      await adapter.execute(`CREATE INDEX "things_Index" ON ${SCHEMA_NAME}.things (name)`);
      await expect(
        adapter.removeIndex(`${SCHEMA2_NAME}.things`, { name: `${SCHEMA_NAME}.things_Index` }),
      ).rejects.toThrow(ArgumentError);

      // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if supports_partitioned_indexes?` (schema_test.rb:424)
      if (await adapter.supportsPartitionedIndexes()) {
        await createPartitionedTable();

        await adapter.execute(
          `CREATE INDEX "${PARTITIONED_TABLE}_Index" ON ${SCHEMA_NAME}.${PARTITIONED_TABLE} (logdate, city_id)`,
        );
        await expect(
          adapter.removeIndex(PARTITIONED_TABLE, {
            name: `${SCHEMA_NAME}.${PARTITIONED_TABLE}_Index`,
          }),
        ).resolves.not.toThrow();

        await adapter.execute(
          `CREATE INDEX "${PARTITIONED_TABLE}_Index" ON ${SCHEMA_NAME}.${PARTITIONED_TABLE} (logdate, city_id)`,
        );
        await expect(
          adapter.removeIndex(`${SCHEMA_NAME}.${PARTITIONED_TABLE}`, {
            name: `${PARTITIONED_TABLE}_Index`,
          }),
        ).resolves.not.toThrow();

        await adapter.execute(
          `CREATE INDEX "${PARTITIONED_TABLE}_Index" ON ${SCHEMA_NAME}.${PARTITIONED_TABLE} (logdate, city_id)`,
        );
        await expect(
          adapter.removeIndex(`${SCHEMA_NAME}.${PARTITIONED_TABLE}`, {
            name: `${SCHEMA_NAME}.${PARTITIONED_TABLE}_Index`,
          }),
        ).resolves.not.toThrow();

        await adapter.execute(
          `CREATE INDEX "${PARTITIONED_TABLE}_Index" ON ${SCHEMA_NAME}.${PARTITIONED_TABLE} (logdate, city_id)`,
        );
        await expect(
          adapter.removeIndex(`${SCHEMA2_NAME}.${PARTITIONED_TABLE}`, {
            name: `${SCHEMA_NAME}.${PARTITIONED_TABLE}_Index`,
          }),
        ).rejects.toThrow(ArgumentError);
      }
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
      for (const given of [
        `"${SCHEMA_NAME}"."${PK_TABLE_NAME}"`,
        `"${SCHEMA_NAME}"."${UNMATCHED_PK_TABLE_NAME}"`,
      ]) {
        const [pk, seq] = (await adapter.pkAndSequenceFor(given))!;
        expect(pk, `primary key should be found when table referenced as ${given}`).toEqual("id");
        if (given === `"${SCHEMA_NAME}"."${PK_TABLE_NAME}"`)
          expect(seq, `sequence name should be found when table referenced as ${given}`).toEqual(
            new Name(SCHEMA_NAME, `${PK_TABLE_NAME}_id_seq`),
          );
        if (given === `"${SCHEMA_NAME}"."${UNMATCHED_PK_TABLE_NAME}"`)
          expect(seq, `sequence name should be found when table referenced as ${given}`).toEqual(
            new Name(SCHEMA_NAME, UNMATCHED_SEQUENCE_NAME),
          );
      }
    });

    it("current schema", async () => {
      for (const [given, expected] of Object.entries({
        [`'$user',public`]: "public",
        [SCHEMA_NAME]: SCHEMA_NAME,
        [`${SCHEMA2_NAME},${SCHEMA_NAME},public`]: SCHEMA2_NAME,
        [`public,${SCHEMA2_NAME},${SCHEMA_NAME}`]: "public",
      })) {
        await withSchemaSearchPath(given, async () => {
          expect(await adapter.currentSchema()).toEqual(expected);
        });
      }
    });

    it("prepared statements with multiple schemas", async () => {
      const Thing5 = makeThing5Model() as Record<string, any>;
      for (const schemaName of [SCHEMA_NAME, SCHEMA2_NAME]) {
        await withSchemaSearchPath(schemaName, async () => {
          await Thing5.create({
            id: 1,
            name: `thing inside ${SCHEMA_NAME}`,
            email: "thing1@localhost",
            moment: new Date(),
          });
        });
      }

      for (const schemaName of [SCHEMA_NAME, SCHEMA2_NAME]) {
        await withSchemaSearchPath(schemaName, async () => {
          expect(await Thing5.count()).toEqual(1);
        });
      }
    });

    it("schema exists?", async () => {
      for (const [given, expected] of Object.entries({
        public: true,
        [SCHEMA_NAME]: true,
        [SCHEMA2_NAME]: true,
        darkside: false,
      })) {
        expect(await adapter.schemaExists(given)).toEqual(expected);
      }
    });

    it("reset pk sequence", async () => {
      const seqName = `${SCHEMA_NAME}.${UNMATCHED_SEQUENCE_NAME}`;
      await adapter.execute(`SELECT setval('${seqName}', 123)`);
      const before = await adapter.execute(`SELECT nextval('${seqName}') AS val`);
      expect(Number(before[0].val)).toBe(124);

      await adapter.resetPkSequenceBang(`${SCHEMA_NAME}.${UNMATCHED_PK_TABLE_NAME}`);
      const after = await adapter.execute(`SELECT nextval('${seqName}') AS val`);
      expect(Number(after[0].val)).toBe(1);
    });

    it("set pk sequence", async () => {
      const tableName = `${SCHEMA_NAME}.${PK_TABLE_NAME}`;
      await adapter.setPkSequenceBang(tableName, 123);
      const result = await adapter.pkAndSequenceFor(`"${SCHEMA_NAME}"."${PK_TABLE_NAME}"`);
      const qualifiedSeq = result![1]!.quoted();
      const rows = await adapter.execute(`SELECT nextval('${qualifiedSeq}') AS val`);
      expect(Number(rows[0].val)).toBe(124);
      await adapter.resetPkSequenceBang(tableName);
    });

    it("rename index", async () => {
      const oldName = INDEX_A_NAME;
      const newName = `${oldName}_new`;
      await adapter.renameIndex(`${SCHEMA_NAME}.${TABLE_NAME}`, oldName, newName);
      expect(await adapter.indexNameExists(`${SCHEMA_NAME}.${TABLE_NAME}`, oldName)).toBeFalsy();
      expect(await adapter.indexNameExists(`${SCHEMA_NAME}.${TABLE_NAME}`, newName)).toBeTruthy();
    });

    it("dumping schemas", async () => {
      const output = await dumpAllTableSchema([/./], adapter as unknown as SchemaSource);
      expect(output).not.toMatch(/createSchema\("public"\)/);
      expect(output).toMatch(/createSchema\("test_schema"\)/);
      expect(output).toMatch(/createSchema\("test_schema2"\)/);
    }, 30_000);
  });

  describe("SchemaForeignKeyTest", () => {
    beforeEach(async () => {
      await adapter.dropSchema("my_schema", { ifExists: true });
      await adapter.createSchema("my_schema");
    });
    afterEach(async () => {
      await adapter.execute(
        `DROP TABLE IF EXISTS my_schema.wagons, my_other_schema.wagons CASCADE`,
      );
      await adapter.dropSchema("my_other_schema", { ifExists: true });
      await adapter.dropSchema("my_schema", { ifExists: true });
    });

    it("dump foreign key targeting different schema", async () => {
      try {
        await adapter.execute(
          `CREATE TABLE my_schema.trains (id serial primary key, name varchar(50))`,
        );
        await adapter.execute(`CREATE TABLE wagons (id serial primary key, train_id integer)`);
        await adapter.addForeignKey("wagons", "my_schema.trains");
        const lines = new StringIO();
        await adapter.createSchemaDumper({}).foreignKeys("wagons", lines);
        const output = lines.string();
        expect(output).toMatch(/addForeignKey\("wagons", "my_schema\.trains"/);
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS wagons`);
        await adapter.execute(`DROP TABLE IF EXISTS my_schema.trains`);
      }
    });

    it("create foreign key same schema", async () => {
      await adapter.createTable("my_schema.trains");
      await adapter.createTable("my_schema.wagons", (t) => {
        t.integer("train_id");
      });
      await adapter.addForeignKey("my_schema.wagons", "my_schema.trains");
      expect(await adapter.foreignKeyExists("my_schema.wagons", "my_schema.trains")).toBeTruthy();
    });

    it("create foreign key different schemas", async () => {
      try {
        await adapter.createSchema("my_other_schema");
        await adapter.createTable("my_schema.trains");
        await adapter.createTable("my_other_schema.wagons", (t) => {
          t.integer("train_id");
        });
        await adapter.addForeignKey("my_other_schema.wagons", "my_schema.trains");
        expect(
          await adapter.foreignKeyExists("my_other_schema.wagons", "my_schema.trains"),
        ).toBeTruthy();
      } finally {
        await adapter.dropSchema("my_other_schema", { ifExists: true });
      }
    });
  });

  describe("SchemaIndexOpclassTest", () => {
    beforeEach(async () => {
      await adapter.createTable("trains", (t) => {
        t.string("name");
        t.string("position");
        t.text("description");
      });
    });
    afterEach(async () => {
      await adapter.dropTable("trains", { ifExists: true });
    });

    it("string opclass is dumped", async () => {
      await adapter.execute(
        `CREATE INDEX trains_name_and_description ON trains USING btree(name text_pattern_ops, description text_pattern_ops)`,
      );

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).toMatch(/opclass: "text_pattern_ops"/);
    });
    it("non default opclass is dumped", async () => {
      await adapter.execute(
        `CREATE INDEX trains_name_and_description ON trains USING btree(name, description text_pattern_ops)`,
      );

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).toMatch(/opclass: \{ description: "text_pattern_ops" \}/);
    });
    it("opclass class parsing on non reserved and cannot be function or type keyword", async () => {
      await adapter.enableExtension("pg_trgm");
      await adapter.execute(
        `CREATE INDEX trains_position ON trains USING gin(position gin_trgm_ops)`,
      );
      await adapter.execute(
        `CREATE INDEX trains_name_and_position ON trains USING btree(name, position text_pattern_ops)`,
      );

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).toMatch(/opclass: "gin_trgm_ops"/);
      expect(output).toMatch(/opclass: \{ position: "text_pattern_ops" \}/);
    });
  });

  describe("SchemaIndexNullsOrderTest", () => {
    beforeEach(async () => {
      await adapter.createTable("trains", (t) => {
        t.string("name");
        t.text("description");
      });
    });
    afterEach(async () => {
      await adapter.dropTable("trains", { ifExists: true });
    });

    it("nulls order is dumped", async () => {
      await adapter.execute(
        `CREATE INDEX trains_name_and_description ON trains USING btree(name NULLS FIRST, description)`,
      );
      const output = await dumpTableSchema(adapter, "trains");
      expect(output).toMatch(/order: \{ name: "NULLS FIRST" \}/);
    });
    it("non default order with nulls is dumped", async () => {
      await adapter.execute(
        `CREATE INDEX trains_name_and_desc ON trains USING btree(name DESC NULLS LAST, description)`,
      );
      const output = await dumpTableSchema(adapter, "trains");
      expect(output).toMatch(/order: \{ name: "DESC NULLS LAST" \}/);
    });
  });

  describe("DefaultsUsingMultipleSchemasAndDomainTest", () => {
    let oldSearchPath: string;

    beforeEach(async () => {
      await adapter.dropSchema("schema_1", { ifExists: true });
      await adapter.execute("CREATE SCHEMA schema_1");
      await adapter.execute("CREATE DOMAIN schema_1.text AS text");
      await adapter.execute("CREATE DOMAIN schema_1.varchar AS varchar");
      await adapter.execute("CREATE DOMAIN schema_1.bpchar AS bpchar");

      oldSearchPath = await adapter.schemaSearchPath();
      await adapter.setSchemaSearchPath("schema_1, pg_catalog");
      // eslint-disable-next-line blazetrails/require-table-teardown -- dropped with schema_1 (teardown drop_schema)
      await adapter.createTable("defaults", (t) => {
        t.text("text_col", { default: "some value" });
        t.string("string_col", { default: "some value" });
        t.decimal("decimal_col", { default: "3.14159265358979323846" });
      });
      void Default.resetColumnInformation();
      await Default.loadSchema();
    });
    afterEach(async () => {
      await adapter.setSchemaSearchPath(oldSearchPath);
      await adapter.dropSchema("schema_1", { ifExists: true });
      void Default.resetColumnInformation();
    });

    it("text defaults in new schema when overriding domain", async () => {
      expect(new Default().text_col, "Default of text column was not correctly parsed").toEqual(
        "some value",
      );
    });

    it("string defaults in new schema when overriding domain", async () => {
      expect(new Default().string_col, "Default of string column was not correctly parsed").toEqual(
        "some value",
      );
    });

    it("decimal defaults in new schema when overriding domain", async () => {
      expect(
        new Default().decimal_col,
        "Default of decimal column was not correctly parsed",
      ).toEqual(new BigDecimal("3.14159265358979323846"));
    });

    it("bpchar defaults in new schema when overriding domain", async () => {
      await adapter.execute("ALTER TABLE defaults ADD bpchar_col bpchar DEFAULT 'some value'");
      void Default.resetColumnInformation();
      await Default.loadSchema();
      expect(new Default().bpchar_col, "Default of bpchar column was not correctly parsed").toEqual(
        "some value",
      );
    });

    it("text defaults after updating column default", async () => {
      await adapter.execute(
        "ALTER TABLE defaults ALTER COLUMN text_col SET DEFAULT 'some text'::schema_1.text",
      );
      void Default.resetColumnInformation();
      await Default.loadSchema();
      expect(
        new Default().text_col,
        "Default of text column was not correctly parsed after updating default using '::text' since postgreSQL will add parens to the default in db",
      ).toEqual("some text");
    });

    it("default containing quote and colons", async () => {
      await adapter.execute(
        "ALTER TABLE defaults ALTER COLUMN string_col SET DEFAULT 'foo''::bar'",
      );
      void Default.resetColumnInformation();
      await Default.loadSchema();
      expect(new Default().string_col).toEqual("foo'::bar");
    });
  });

  describe("SchemaWithDotsTest", () => {
    beforeEach(async () => {
      await adapter.dropSchema("my.schema", { ifExists: true });
      await adapter.createSchema("my.schema");
    });
    afterEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS "my.schema" CASCADE`);
      await adapter.dropSchema("my.schema", { ifExists: true });
    });

    it("rename_table", async () => {
      await withSchemaSearchPath('"my.schema"', async () => {
        // eslint-disable-next-line blazetrails/require-table-teardown -- dropped with the my.schema schema (SchemaWithDotsTest teardown)
        await adapter.createTable("posts");
        await adapter.renameTable("posts", "articles");
        expect(await adapter.tables()).toEqual(["articles"]);
      });
    });

    it("Active Record basics", async () => {
      await adapter.setSchemaSearchPath('"my.schema"');
      await adapter.createTable("articles", (t) => {
        t.string("title");
      });
      class Article extends Base {
        static {
          this.tableName = '"my.schema".articles';
          this.attribute("id", "integer");
        }
      }
      try {
        await Article.loadSchema();
        await (Article as any).create({ title: "zOMG, welcome to my blorgh!" });
        const welcome = await (Article as any).last();
        expect(welcome.title).toBe("zOMG, welcome to my blorgh!");
      } finally {
        // eslint-disable-next-line blazetrails/require-canonical-rebuild
        await adapter.dropTable("articles", { ifExists: true });
      }
    });
  });

  describe("SchemaJoinTablesTest", () => {
    beforeEach(async () => {
      await adapter.createSchema("test_schema");
    });
    afterEach(async () => {
      await adapter.dropSchema("test_schema", { ifExists: true });
    });

    it("create join table", async () => {
      await adapter.createJoinTable("test_schema.posts", "test_schema.comments");
      expect(await adapter.tableExists("test_schema.comments_posts")).toBeTruthy();
      const columns = (await adapter.columns("test_schema.comments_posts")).map((c) => c.name);
      expect(columns.sort()).toEqual(["comment_id", "post_id"]);

      await adapter.dropJoinTable("test_schema.posts", "test_schema.comments");
      expect(await adapter.tableExists("test_schema.comments_posts")).toBeFalsy();
    });
  });

  describe("SchemaIndexIncludeColumnsTest", () => {
    it("schema dumps index included columns", async () => {
      const indexDefinition = (await dumpTableSchema(adapter, "companies"))
        .split(/\n/)
        .filter((l) => /t\.index.*company_include_index/.test(l))[0]
        .trim();
      // eslint-disable-next-line blazetrails/no-conditional-in-test -- mirrors Rails' `if ActiveRecord::Base.lease_connection.supports_index_include?` (schema_test.rb:824)
      if (await adapter.supportsIndexInclude()) {
        expect(indexDefinition).toEqual(
          `t.index(["firm_id", "type"], { name: "company_include_index", include: ${JSON.stringify(["name", "account_id"])} });`,
        );
      } else {
        expect(indexDefinition).toEqual(
          't.index(["firm_id", "type"], { name: "company_include_index" });',
        );
      }
    });
  });

  describe("SchemaIndexNullsNotDistinctTest", () => {
    beforeEach(async () => {
      await adapter.createTable("trains", (t) => {
        t.string("name");
      });
    });
    afterEach(async () => {
      await adapter.dropTable("trains", { ifExists: true });
    });

    itIfSupports("nulls_not_distinct", "nulls not distinct is dumped", async () => {
      await adapter.execute(
        `CREATE INDEX trains_name ON trains USING btree(name) NULLS NOT DISTINCT`,
      );

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).toMatch(/nullsNotDistinct: true/);
    });
    itIfSupports("nulls_not_distinct", "nulls distinct is dumped", async () => {
      await adapter.execute(`CREATE INDEX trains_name ON trains USING btree(name) NULLS DISTINCT`);

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).not.toMatch(/nullsNotDistinct/);
    });
    it("nulls not set is dumped", async () => {
      await adapter.execute(`CREATE INDEX trains_name ON trains USING btree(name)`);

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).not.toMatch(/nullsNotDistinct/);
    });
  });

  describe("SchemaCreateTableOptionsTest", () => {
    afterEach(async () => {
      await adapter.dropTable("trains", "transportation_modes", "vehicles", { ifExists: true });
    });

    itIfSupports("native_partitioning", "list partition options is dumped", async () => {
      const options = "PARTITION BY LIST (kind)";

      await adapter.createTable("trains", { id: false, options }, (t) => {
        t.string("name");
        t.string("kind");
      });

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).toMatch(`options: "${options}"`);
    });

    itIfSupports("native_partitioning", "range partition options is dumped", async () => {
      const options = "PARTITION BY RANGE (created_at)";

      await adapter.createTable("trains", { id: false, options }, (t) => {
        t.string("name");
        t.datetime("created_at", { null: false });
      });

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).toMatch(`options: "${options}"`);
    });

    it("inherited table options is dumped", async () => {
      await adapter.createTable("transportation_modes", (t) => {
        t.string("name");
        t.string("kind");
      });

      const options = "INHERITS (transportation_modes)";

      await adapter.createTable("trains", { options });

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).toMatch(`options: "${options}"`);
    });

    it("multiple inherited table options is dumped", async () => {
      await adapter.createTable("vehicles", (t) => {
        t.string("name");
      });

      await adapter.createTable("transportation_modes", (t) => {
        t.string("kind");
      });

      const options = "INHERITS (transportation_modes, vehicles)";

      await adapter.createTable("trains", { options });

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).toMatch(`options: "${options}"`);
    });

    it("no partition options are dumped", async () => {
      await adapter.createTable("trains", (t) => {
        t.string("name");
      });

      const output = await dumpTableSchema(adapter, "trains");

      expect(output).not.toMatch("options:");
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
      await adapter.createSchemaDumper({}).dumpTable(lines, "commented_table");
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
