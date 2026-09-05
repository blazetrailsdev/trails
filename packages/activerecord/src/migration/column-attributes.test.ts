import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { BigDecimal, Duration } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";

class TestModel extends Base {
  declare age: unknown;
  declare bio: unknown;
  declare birthday: unknown;
  declare command: unknown;
  declare favorite_day: unknown;
  declare first_name: unknown;
  declare height: unknown;
  declare last_name: unknown;
  declare wealth: BigDecimal | null;
  static {
    this._tableName = "test_models";
  }
}

async function assertColumn(model: typeof TestModel, columnName: string): Promise<void> {
  void model.resetColumnInformation();
  await model.loadSchema();
  expect(model.columnNames()).toContain(columnName);
}

async function assertNoColumn(model: typeof TestModel, columnName: string): Promise<void> {
  void model.resetColumnInformation();
  await model.loadSchema();
  expect(model.columnNames()).not.toContain(columnName);
}

describe("Migration", () => {
  describe("ColumnAttributesTest", () => {
    beforeEach(async () => {
      const connection = await ambientConnection();
      await connection.createTable("test_models", { force: true }, (t) => {
        t.timestamps({ null: true });
      });
      void TestModel.resetColumnInformation();
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable("test_models", { ifExists: true });
      void TestModel.resetColumnInformation();
    });

    it("add column newline default", async () => {
      const connection = await ambientConnection();
      const string = "foo\nbar";
      await connection.addColumn("test_models", "command", "string", { default: string });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();

      expect(TestModel.new().command).toBe(string);
    });

    it("add remove single field using string arguments", async () => {
      const connection = await ambientConnection();
      await assertNoColumn(TestModel, "last_name");

      await connection.addColumn("test_models", "last_name", "string");
      await assertColumn(TestModel, "last_name");

      await connection.removeColumn("test_models", "last_name");
      await assertNoColumn(TestModel, "last_name");
    });

    it("add remove single field using symbol arguments", async () => {
      const connection = await ambientConnection();
      await assertNoColumn(TestModel, "last_name");

      await connection.addColumn("test_models", "last_name", "string");
      await assertColumn(TestModel, "last_name");

      await connection.removeColumn("test_models", "last_name");
      await assertNoColumn(TestModel, "last_name");
    });

    it.skipIf(adapterType === "mysql")("add column without limit", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "description", "string", { limit: null });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["description"].limit).toBeNull();
    });

    it.skipIf(adapterType === "sqlite")("unabstracted database dependent types", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "intelligence_quotient", "smallint");
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();
      expect(TestModel.columnsHash()["intelligence_quotient"].sqlType).toMatch(/smallint/);
    });

    it.skipIf(adapterType === "sqlite")("native decimal insert manual vs automatic", async () => {
      const connection = await ambientConnection();
      const correctValue = new BigDecimal("0012345678901234567890.0123456789");

      await connection.addColumn("test_models", "wealth", "decimal", {
        precision: 30,
        scale: 10,
      });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();

      await connection.execute(
        "insert into test_models (wealth) values (12345678901234567890.0123456789)",
      );

      let row = await TestModel.first();
      expect(row!.wealth).toBeInstanceOf(BigDecimal);

      expect(row!.wealth).toEqual(correctValue);

      await TestModel.deleteAll();

      await TestModel.create({ wealth: new BigDecimal("12345678901234567890.0123456789") });

      row = await TestModel.first();
      expect(row!.wealth).toBeInstanceOf(BigDecimal);

      expect(row!.wealth).toEqual(correctValue);
    });

    it("add column with precision and scale", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "wealth", "decimal", { precision: 9, scale: 7 });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();

      const wealthColumn = TestModel.columnsHash()["wealth"];
      expect(wealthColumn.precision).toBe(9);
      expect(wealthColumn.scale).toBe(7);
    });

    it.skipIf(adapterType !== "sqlite")("change column with new precision and scale", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "wealth", "decimal", { precision: 9, scale: 7 });

      await connection.changeColumn("test_models", "wealth", "decimal", {
        precision: 12,
        scale: 8,
      });
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();

      const wealthColumn = TestModel.columnsHash()["wealth"];
      expect(wealthColumn.precision).toBe(12);
      expect(wealthColumn.scale).toBe(8);
    });

    it.skipIf(adapterType !== "sqlite")(
      "change column preserve other column precision and scale",
      async () => {
        const connection = await ambientConnection();
        await connection.addColumn("test_models", "last_name", "string");
        await connection.addColumn("test_models", "wealth", "decimal", { precision: 9, scale: 7 });
        void TestModel.resetColumnInformation();
        await TestModel.loadSchema();

        let wealthColumn = TestModel.columnsHash()["wealth"];
        expect(wealthColumn.precision).toBe(9);
        expect(wealthColumn.scale).toBe(7);

        await connection.changeColumn("test_models", "last_name", "string", { null: false });
        void TestModel.resetColumnInformation();
        await TestModel.loadSchema();

        wealthColumn = TestModel.columnsHash()["wealth"];
        expect(wealthColumn.precision).toBe(9);
        expect(wealthColumn.scale).toBe(7);
      },
    );

    it.skipIf(adapterType === "sqlite")("native types", async () => {
      const connection = await ambientConnection();
      await connection.addColumn("test_models", "first_name", "string");
      await connection.addColumn("test_models", "last_name", "string");
      await connection.addColumn("test_models", "bio", "text");
      await connection.addColumn("test_models", "age", "integer");
      await connection.addColumn("test_models", "height", "float");
      await connection.addColumn("test_models", "wealth", "decimal", { precision: 30, scale: 10 });
      await connection.addColumn("test_models", "birthday", "datetime");
      await connection.addColumn("test_models", "favorite_day", "date");
      await connection.addColumn("test_models", "moment_of_truth", "datetime");
      await connection.addColumn("test_models", "male", "boolean");
      void TestModel.resetColumnInformation();
      await TestModel.loadSchema();

      await TestModel.create({
        first_name: "bob",
        last_name: "bobsen",
        bio: "I was born ....",
        age: 18,
        height: 1.78,
        wealth: new BigDecimal("12345678901234567890.0123456789"),
        birthday: Duration.years(18).ago(),
        favorite_day: Duration.days(10).ago(),
        moment_of_truth: "1782-10-10 21:40:18",
        male: true,
      });

      const bob = (await TestModel.first())!;
      expect(bob.first_name).toBe("bob");
      expect(bob.last_name).toBe("bobsen");
      expect(bob.bio).toBe("I was born ....");
      expect(bob.age).toBe(18);

      expect(bob.wealth).toEqual(new BigDecimal("0012345678901234567890.0123456789"));

      expect(bob.queryAttribute("male")).toBe(true);

      expect(typeof bob.first_name).toBe("string");
      expect(typeof bob.last_name).toBe("string");
      expect(typeof bob.bio).toBe("string");
      expect(typeof bob.age).toBe("number");
      expect(bob.birthday).toBeInstanceOf(RubyTime);
      expect(bob.favorite_day).toBeInstanceOf(Temporal.PlainDate);
      expect(bob.queryAttribute("male")).toBe(true);
      expect(bob.wealth).toBeInstanceOf(BigDecimal);
    });

    it.skipIf(adapterType === "sqlite")("out of range limit should raise", async () => {
      const connection = await ambientConnection();
      await expect(
        connection.addColumn("test_models", "integer_too_big", "integer", { limit: 10 }),
      ).rejects.toThrow(ArgumentError);
      await expect(
        connection.addColumn("test_models", "text_too_big", "text", { limit: 0xfffffffff }),
      ).rejects.toThrow(ArgumentError);
      await expect(
        connection.addColumn("test_models", "binary_too_big", "binary", { limit: 0xfffffffff }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
