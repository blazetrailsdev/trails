import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { sql as arelSql } from "@blazetrails/arel";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

class PostgresqlMoney extends Base {
  static {
    this.tableName = "postgresql_moneys";
    this.attribute("id", "integer");
    this.validates("depth", { numericality: true });
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.execute("set lc_monetary = 'C'");
    await connection.createTable("postgresql_moneys", { force: true }, (t) => {
      t.money("wealth");
      t.money("depth", { default: "150.55" });
    });
    void PostgresqlMoney.resetColumnInformation();
    await PostgresqlMoney.loadSchema();
  });

  afterEach(async () => {
    await connection.dropTable("postgresql_moneys", { ifExists: true });
    void PostgresqlMoney.resetColumnInformation();
  });

  describe("PostgresqlMoneyTest", () => {
    it("column", async () => {
      const column = PostgresqlMoney.columnsHash()["wealth"] as unknown as PgColumn;
      expect(column.type).toBe("money");
      expect(column.sqlType).toBe("money");
      expect(column.scale).toBe(2);
      expect(column.array).toBeFalsy();

      const type = PostgresqlMoney.typeForAttribute("wealth")!;
      expect(type.isBinary()).toBe(false);
    });

    it("default", async () => {
      expect((PostgresqlMoney.columnDefaults["depth"] as BigDecimal).toString("F")).toBe("150.55");
      expect(((PostgresqlMoney.new() as any).depth as BigDecimal).toString("F")).toBe("150.55");
      expect((PostgresqlMoney.new() as any).depthBeforeTypeCast).toBe("150.55");
    });

    it("money values", async () => {
      await connection.execute(
        "INSERT INTO postgresql_moneys (id, wealth) VALUES (1, '567.89'::money)",
      );
      await connection.execute(
        "INSERT INTO postgresql_moneys (id, wealth) VALUES (2, '-567.89'::money)",
      );
      const firstMoney = (await PostgresqlMoney.find(1)) as any;
      const secondMoney = (await PostgresqlMoney.find(2)) as any;
      expect(Number(firstMoney.wealth)).toBeCloseTo(567.89, 2);
      expect(Number(secondMoney.wealth)).toBeCloseTo(-567.89, 2);
      const v1 = await connection.queryValue("SELECT wealth FROM postgresql_moneys WHERE id = 1");
      expect(Number(v1)).toBeCloseTo(567.89, 2);
      const v2 = await connection.queryValue("SELECT wealth FROM postgresql_moneys WHERE id = 2");
      expect(Number(v2)).toBeCloseTo(-567.89, 2);
    });

    it("money type cast", () => {
      const type = PostgresqlMoney.typeForAttribute("wealth")!;
      for (const [str, num] of [
        ["12,345,678.12", 12345678.12],
        ["12.345.678,12", 12345678.12],
        ["0.12", 0.12],
        ["0,12", 0.12],
      ] as const) {
        expect(Number(type.cast(str))).toBeCloseTo(num);
        expect(Number(type.cast(`$${str}`))).toBeCloseTo(num);
        expect(Number(type.cast(`-${str}`))).toBeCloseTo(-num);
        expect(Number(type.cast(`-$${str}`))).toBeCloseTo(-num);
        expect(Number(type.cast(`(${str})`))).toBeCloseTo(-num);
        expect(Number(type.cast(`($${str})`))).toBeCloseTo(-num);
      }
    });

    it("money regex backtracking", () => {
      const type = PostgresqlMoney.typeForAttribute("wealth")!;
      expect(Number(type.cast("$" + ",".repeat(100000) + ".11!"))).toBeCloseTo(0, 2);
      expect(Number(type.cast("$" + ".".repeat(100000) + ",11!"))).toBeCloseTo(0, 2);
    });

    it("sum with type cast", async () => {
      await connection.execute(
        "INSERT INTO postgresql_moneys (id, wealth) VALUES (1, '123.45'::money)",
      );
      expect(Number(await (PostgresqlMoney as any).sum("id * wealth"))).toBeCloseTo(123.45, 2);
    });

    it("pluck with type cast", async () => {
      await connection.execute(
        "INSERT INTO postgresql_moneys (id, wealth) VALUES (1, '123.45'::money)",
      );
      const plucked = await (PostgresqlMoney as any).pluck(arelSql("id * wealth"));
      expect(plucked).toHaveLength(1);
      expect(Number(plucked[0])).toBeCloseTo(123.45, 2);
    });

    it("schema dumping", async () => {
      const output = await SchemaDumper.dumpTableSchema(connection, "postgresql_moneys");
      expect(output).toMatch(/t\.money\s*\("wealth",\s*\{\s*scale:\s*2\s*\}/);
      expect(output).toMatch(
        /t\.money\s*\("depth",\s*\{[^}]*scale:\s*2[^}]*default:\s*"150\.55"[^}]*\}/,
      );
    });

    it("create and update money", async () => {
      const money = await (PostgresqlMoney as any).create({ wealth: "987.65" });
      expect(Number(money.wealth)).toBeCloseTo(987.65, 2);
      money.wealth = "123.45";
      await money.saveBang();
      await money.reload();
      expect(Number(money.wealth)).toBeCloseTo(123.45, 2);
    });

    it("update all with money string", async () => {
      const money = await (PostgresqlMoney as any).createBang({});
      await (PostgresqlMoney as any).updateAll({ wealth: "987.65" });
      await money.reload();
      expect(Number(money.wealth)).toBeCloseTo(987.65, 2);
    });

    it("update all with money big decimal", async () => {
      const money = await (PostgresqlMoney as any).createBang({});
      await (PostgresqlMoney as any).updateAll({ wealth: "123.45" });
      await money.reload();
      expect(Number(money.wealth)).toBeCloseTo(123.45, 2);
    });

    it("update all with money numeric", async () => {
      const money = await (PostgresqlMoney as any).createBang({});
      await (PostgresqlMoney as any).updateAll({ wealth: 123.45 });
      await money.reload();
      expect(Number(money.wealth)).toBeCloseTo(123.45, 2);
    });
  });
});
