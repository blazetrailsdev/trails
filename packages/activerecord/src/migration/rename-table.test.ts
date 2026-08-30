import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { assertRaises } from "@blazetrails/activesupport";

interface TableNameLimits {
  tableNameLength(): number;
}

interface IndexShape {
  readonly name: string;
  readonly columns: string[];
}

describe("Migration", () => {
  beforeEach(async () => {
    const connection = await ambientConnection();
    await connection.createTable("test_models", { force: true }, (t) => {
      t.timestamps({ null: true });
    });
    await connection.addColumn("test_models", "url", "string");
    await connection.removeColumn("test_models", "created_at");
    await connection.removeColumn("test_models", "updated_at");
  });

  afterEach(async () => {
    const connection = await ambientConnection();
    if (await connection.tableExists("octopi")) {
      await connection.renameTable("octopi", "test_models");
    }
    await connection.dropTable("test_models", { ifExists: true });
  });

  describe("RenameTableTest", () => {
    it("rename table should work with reserved words", async () => {
      const connection = await ambientConnection();
      let renamed = false;

      await connection.renameTable("references", "old_references");
      await connection.renameTable("test_models", "references");

      renamed = true;

      try {
        const tableName = connection.quoteTableName("references");
        await connection.execute(
          `INSERT INTO ${tableName} (id, url) VALUES (123, 'http://rubyonrails.com')`,
        );
        expect(await connection.selectValue(`SELECT url FROM ${tableName} WHERE id=123`)).toBe(
          "http://rubyonrails.com",
        );
      } finally {
        if (renamed) {
          await connection.renameTable("references", "test_models");
          await connection.renameTable("old_references", "references");
        }
      }
    });

    it("rename table", async () => {
      const connection = await ambientConnection();
      await connection.renameTable("test_models", "octopi");

      await connection.execute(
        `INSERT INTO octopi (${connection.quoteColumnName("id")}, ${connection.quoteColumnName("url")}) VALUES (1, 'http://www.foreverflying.com/octopus-black7.jpg')`,
      );

      expect(await connection.selectValue("SELECT url FROM octopi WHERE id=1")).toBe(
        "http://www.foreverflying.com/octopus-black7.jpg",
      );
    });

    it("rename table raises for long table names", async () => {
      const connection = await ambientConnection();
      const nameLimit = (connection as unknown as TableNameLimits).tableNameLength();
      const longName = "a".repeat(nameLimit + 1);
      const shortName = "a".repeat(nameLimit);

      try {
        const error = await assertRaises([ArgumentError], {}, () =>
          connection.renameTable("test_models", longName),
        );
        expect(error.message).toBe(
          `Table name '${longName}' is too long; the limit is ${nameLimit} characters`,
        );

        await connection.renameTable("test_models", shortName);
        expect(await connection.tableExists(shortName)).toBeTruthy();
      } finally {
        await connection.dropTable(shortName, { ifExists: true });
      }
    });

    it("rename table with an index", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("test_models", "url");

      await connection.renameTable("test_models", "octopi");

      await connection.execute(
        `INSERT INTO octopi (${connection.quoteColumnName("id")}, ${connection.quoteColumnName("url")}) VALUES (1, 'http://www.foreverflying.com/octopus-black7.jpg')`,
      );

      expect(await connection.selectValue("SELECT url FROM octopi WHERE id=1")).toBe(
        "http://www.foreverflying.com/octopus-black7.jpg",
      );
      const index = (await connection.indexes("octopi"))[0] as IndexShape;
      expect(index.columns).toContain("url");
      expect(index.name).toBe("index_octopi_on_url");
    });

    it("rename table with long table name and index", async () => {
      const connection = await ambientConnection();
      const longName = "a".repeat((connection as unknown as TableNameLimits).tableNameLength());

      try {
        await connection.addIndex("test_models", "url");
        await connection.renameTable("test_models", longName);

        const index = (await connection.indexes(longName))[0] as IndexShape;
        expect(index.columns).toContain("url");
      } finally {
        await connection.renameTable(longName, "test_models");
      }
    });

    it("rename table does not rename custom named index", async () => {
      const connection = await ambientConnection();
      await connection.addIndex("test_models", "url", { name: "special_url_idx" });

      await connection.renameTable("test_models", "octopi");

      expect((await connection.indexes("octopi")).map((i) => (i as IndexShape).name)).toEqual([
        "special_url_idx",
      ]);
    });
  });
});
