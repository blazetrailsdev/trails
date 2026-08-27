import { describe, it, beforeEach, afterEach, expect } from "vitest";
import {
  describeIfMysqlAdapter,
  leaseMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "./test-helper.js";
import { Base } from "../../base.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("SchemaTest", () => {
    it("float limits", async () => {
      await adapter.createTable("mysql_doubles", { force: true }, (t: any) => {
        t.float("float_no_limit");
        t.float("float_short", { limit: 5 });
        t.float("float_long", { limit: 53 });
        t.float("float_23", { limit: 23 });
        t.float("float_24", { limit: 24 });
        t.float("float_25", { limit: 25 });
      });

      try {
        const cols = (await adapter.columns("mysql_doubles")) as Array<{
          name: string;
          limit: number | null;
        }>;
        const col = (name: string) => cols.find((c) => c.name === name)!;

        expect(col("float_no_limit").limit).toBe(24);
        expect(col("float_short").limit).toBe(24);
        expect(col("float_long").limit).toBe(53);
        expect(col("float_23").limit).toBe(24);
        expect(col("float_24").limit).toBe(24);
        expect(col("float_25").limit).toBe(53);
      } finally {
        await adapter.dropTable("mysql_doubles", { ifExists: true });
      }
    });

    async function withOmgPost(
      fn: (omgPost: typeof Base, db: string) => Promise<void>,
    ): Promise<void> {
      const db = await adapter.currentDatabase();
      class OmgPost extends Base {
        static _tableName = `${db}.posts`;
        static name = "Post";
      }
      OmgPost.inheritanceColumn = "disabled";
      OmgPost.adapter = adapter;
      await fn(OmgPost, db);
    }

    it("schema", async () => {
      await withOmgPost(async (OmgPost) => {
        await adapter.executeMutation(
          "INSERT INTO `posts` (`title`, `body`, `type`) " +
            "VALUES ('Welcome to the weblog', 'Such a lovely day', 'Post')",
        );
        try {
          const first = await (OmgPost as any).first();
          expect(first).toBeTruthy();
        } finally {
          await adapter.executeMutation(
            "DELETE FROM `posts` WHERE `title` = 'Welcome to the weblog'",
          );
        }
      });
    });

    it("primary key", async () => {
      await withOmgPost(async (OmgPost) => {
        const name = (OmgPost as any)._tableName as string;
        expect(await adapter.primaryKey(name)).toBe("id");
      });
    });

    it("data source exists?", async () => {
      await withOmgPost(async (OmgPost) => {
        const name = (OmgPost as any)._tableName as string;
        expect(await adapter.dataSourceExists(name)).toBe(true);
      });
    });

    it("data source exists wrong schema", async () => {
      const db = await adapter.currentDatabase();
      expect(await adapter.dataSourceExists(`${db}.zomg`)).toBe(false);
    });

    it("dump indexes", async () => {
      const indexes = (await adapter.indexes("key_tests")).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      expect(indexes).toHaveLength(3);
      const byName = (n: string) => indexes.find((i) => i.name === n)!;
      expect(byName("index_key_tests_on_snack").using).toBe("btree");
      expect(byName("index_key_tests_on_snack").type).toBeUndefined();
      expect(byName("index_key_tests_on_pizza").using).toBe("btree");
      expect(byName("index_key_tests_on_pizza").type).toBeUndefined();
      expect(byName("index_key_tests_on_awesome").using).toBeUndefined();
      expect(byName("index_key_tests_on_awesome").type).toBe("fulltext");
    });

    it("drop temporary table", async () => {
      await adapter.transaction(async () => {
        await adapter.createTable("temp_table", { temporary: true });
        // eslint-disable-next-line blazetrails/require-table-teardown
        await adapter.dropTable("temp_table", { temporary: true });
      });
    });
  });
});

describeIfMysqlAdapter("MySQLAnsiQuotesTest", () => {
  let ansi: Mysql2Adapter | undefined;
  beforeEach(() => {
    ansi = new Mysql2Adapter({ uri: MYSQL_TEST_URL, variables: { sql_mode: "ANSI_QUOTES" } });
  });
  afterEach(async () => {
    await ansi?.close();
    ansi = undefined;
  });

  it("primary key method with ansi quotes", async () => {
    const a = ansi!;
    expect(await a.primaryKey("topics")).toBe("id");
  });

  it("foreign keys method with ansi quotes", async () => {
    const a = ansi!;
    const fks = await a.foreignKeys("lessons_students");
    expect(fks.map((fk) => [fk.fromTable, fk.toTable, fk.onDelete])).toEqual([
      ["lessons_students", "students", "cascade"],
    ]);
  });
});
