/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_boolean_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { Base } from "../../index.js";

class BooleanType extends Base {
  static tableName = "mysql_booleans";
}

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  let savedEmulateBooleans: boolean;

  async function emulateBooleans(value: boolean): Promise<void> {
    adapter.emulateBooleans = value;
    BooleanType.resetColumnInformation();
    await BooleanType.loadSchema();
  }

  function booleanColumn() {
    return BooleanType.columns().find((c) => c.name === "archived")!;
  }

  function stringColumn() {
    return BooleanType.columns().find((c) => c.name === "published")!;
  }

  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
    await adapter.createTable("mysql_booleans", { force: true }, (t: any) => {
      t.boolean("archived");
      t.string("published", { limit: 1 });
    });
    BooleanType.adapter = adapter;
    await BooleanType.loadSchema();
    savedEmulateBooleans = adapter.emulateBooleans;
  });

  afterEach(async () => {
    await emulateBooleans(savedEmulateBooleans);
    await adapter.dropTable("mysql_booleans", { ifExists: true });
    await adapter.close();
  });

  describe("MysqlBooleanTest", () => {
    it("column type with emulated booleans", async () => {
      await emulateBooleans(true);

      expect(booleanColumn().type).toBe("boolean");
      expect(stringColumn().type).toBe("string");
    });

    it("column type without emulated booleans", async () => {
      await emulateBooleans(false);

      expect(booleanColumn().type).toBe("integer");
      expect(stringColumn().type).toBe("string");
    });

    it("type casting with emulated booleans", async () => {
      await emulateBooleans(true);

      let boolean = await BooleanType.createBang({ archived: true, published: true } as any);
      await (boolean as any).reload();
      let attributes = (boolean as any).attributesBeforeTypeCast;
      expect(attributes["archived"]).toBe(1);
      expect(attributes["published"]).toBe("1");

      boolean = await BooleanType.createBang({ archived: false, published: false } as any);
      await (boolean as any).reload();
      attributes = (boolean as any).attributesBeforeTypeCast;
      expect(attributes["archived"]).toBe(0);
      expect(attributes["published"]).toBe("0");

      expect(adapter.typeCast(true)).toBe(1);
      expect(adapter.typeCast(false)).toBe(0);
    });

    it("type casting without emulated booleans", async () => {
      await emulateBooleans(false);

      let boolean = await BooleanType.createBang({ archived: true, published: true } as any);
      await (boolean as any).reload();
      let attributes = (boolean as any).attributesBeforeTypeCast;
      expect(attributes["archived"]).toBe(1);
      expect(attributes["published"]).toBe("1");

      boolean = await BooleanType.createBang({ archived: false, published: false } as any);
      await (boolean as any).reload();
      attributes = (boolean as any).attributesBeforeTypeCast;
      expect(attributes["archived"]).toBe(0);
      expect(attributes["published"]).toBe("0");

      expect(adapter.typeCast(true)).toBe(1);
      expect(adapter.typeCast(false)).toBe(0);
    });

    it("with booleans stored as 1 and 0", async () => {
      await adapter.execute("INSERT INTO mysql_booleans(archived, published) VALUES(1, '1')");
      const boolean = (await BooleanType.first()) as any;
      expect(boolean.archived).toBe(true);
      expect(boolean.published).toBe("1");
    });

    it("with booleans stored as t", async () => {
      await adapter.execute("INSERT INTO mysql_booleans(published) VALUES('t')");
      const boolean = (await BooleanType.first()) as any;
      expect(boolean.published).toBe("t");
    });
  });
});
