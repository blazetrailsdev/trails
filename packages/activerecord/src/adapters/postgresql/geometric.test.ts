import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNotPredicate } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-helpers/use-fixtures.js";
import { Base } from "../../index.js";
import { TableDefinition } from "../../connection-adapters/postgresql/schema-definitions.js";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import "../../connection-adapters/postgresql/oid/point.js";
import { ActiveRecord } from "../../namespaces.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });

  describe("PostgreSQLPointTest", () => {
    class PostgresqlPoint extends Base {
      declare x: InstanceType<typeof ActiveRecord.Point>;
      declare y: InstanceType<typeof ActiveRecord.Point>;
      declare z: InstanceType<typeof ActiveRecord.Point>;
      declare array_of_points: InstanceType<typeof ActiveRecord.Point>[];
      declare legacy_x: number[];
      declare legacy_y: number[];
      declare legacy_z: number[];
      static {
        this.tableName = "postgresql_points";
        this.attribute("x", "point");
        this.attribute("y", "point");
        this.attribute("z", "point");
        this.attribute("array_of_points", "point", { array: true });
        this.attribute("legacy_x", "legacy_point");
        this.attribute("legacy_y", "legacy_point");
        this.attribute("legacy_z", "legacy_point");
      }
    }

    beforeEach(async () => {
      await adapter.dropTable("postgresql_points", { ifExists: true });
      await adapter.createTable("postgresql_points", (t: TableDefinition) => {
        t.point("x");
        t.point("y", { default: [12.2, 13.3] });
        t.point("z", { default: "(14.4,15.5)" });
        t.point("array_of_points", { array: true });
        t.point("legacy_x");
        t.point("legacy_y", { default: [12.2, 13.3] });
        t.point("legacy_z", { default: "(14.4,15.5)" });
      });
      void PostgresqlPoint.resetColumnInformation();
      await PostgresqlPoint.loadSchema();
    });
    afterEach(async () => {
      await adapter.dropTable("postgresql_points", { ifExists: true });
    });

    it("column", async () => {
      const column = PostgresqlPoint.columnsHash()["x"] as unknown as PgColumn;
      expect(column.type).toBe("point");
      expect(column.sqlType).toBe("point");
      assertNotPredicate(column, (c) => c.isArray());

      const type = PostgresqlPoint.typeForAttribute("x")!;
      assertNotPredicate(type, (t) => t.isBinary());
    });

    it("default", async () => {
      expect(PostgresqlPoint.columnDefaults["y"]).toEqual(new ActiveRecord.Point(12.2, 13.3));
      expect(new PostgresqlPoint().y).toEqual(new ActiveRecord.Point(12.2, 13.3));

      expect(PostgresqlPoint.columnDefaults["z"]).toEqual(new ActiveRecord.Point(14.4, 15.5));
      expect(new PostgresqlPoint().z).toEqual(new ActiveRecord.Point(14.4, 15.5));
    });

    it("schema dumping", async () => {
      const output = await dumpTableSchema("postgresql_points");
      expect(output).toMatch(/t\.point\("x"\);$/m);
      expect(output).toMatch(/t\.point\("y",\s+\{?\s*default: \[12\.2, 13\.3\] \}\);$/m);
      expect(output).toMatch(/t\.point\("z",\s+\{?\s*default: \[14\.4, 15\.5\] \}\);$/m);
    });

    it("roundtrip", async () => {
      await PostgresqlPoint.createBang({ x: [10, 25.2] });
      const record = (await PostgresqlPoint.first())!;
      expect(record.x).toEqual(new ActiveRecord.Point(10, 25.2));

      record.x = new ActiveRecord.Point(1.1, 2.2);
      await record.saveBang();
      expect(await record.reload()).toBeTruthy();
      expect(record.x).toEqual(new ActiveRecord.Point(1.1, 2.2));
    });

    it("mutation", async () => {
      const p = await PostgresqlPoint.createBang({ x: new ActiveRecord.Point(10, 20) });

      p.x.y = 25;
      await p.saveBang();
      await p.reload();

      expect(p.x).toEqual(new ActiveRecord.Point(10.0, 25.0));
      assertNotPredicate(p, (r) => r.isChanged);
    });

    it("array assignment", () => {
      const p = new PostgresqlPoint({ x: [1, 2] });

      expect(p.x).toEqual(new ActiveRecord.Point(1, 2));
    });

    it("hash assignment", () => {
      const p = new PostgresqlPoint({ x: { x: 1, y: 2 }, y: { x: 3, y: 4 } });

      expect(p.x).toEqual(new ActiveRecord.Point(1, 2));
      expect(p.y).toEqual(new ActiveRecord.Point(3, 4));
    });

    it("string assignment", () => {
      const p = new PostgresqlPoint({ x: "(1, 2)" });

      expect(p.x).toEqual(new ActiveRecord.Point(1, 2));
    });

    it("empty string assignment", () => {
      const p = new PostgresqlPoint({ x: "" });
      expect(p.x).toBeNull();
    });

    it("array of points round trip", async () => {
      const expectedValue = [
        new ActiveRecord.Point(1, 2),
        new ActiveRecord.Point(2, 3),
        new ActiveRecord.Point(3, 4),
      ];
      const p = new PostgresqlPoint({ array_of_points: expectedValue });

      expect(p.array_of_points).toEqual(expectedValue);
      await p.saveBang();
      await p.reload();
      expect(p.array_of_points).toEqual(expectedValue);
    });

    it("legacy column", async () => {
      const column = PostgresqlPoint.columnsHash()["legacy_x"] as unknown as PgColumn;
      expect(column.type).toBe("point");
      expect(column.sqlType).toBe("point");
      assertNotPredicate(column, (c) => c.isArray());

      const type = PostgresqlPoint.typeForAttribute("legacy_x")!;
      assertNotPredicate(type, (t) => t.isBinary());
    });

    it("legacy default", async () => {
      expect(PostgresqlPoint.columnDefaults["legacy_y"]).toEqual([12.2, 13.3]);
      expect(new PostgresqlPoint().legacy_y).toEqual([12.2, 13.3]);

      expect(PostgresqlPoint.columnDefaults["legacy_z"]).toEqual([14.4, 15.5]);
      expect(new PostgresqlPoint().legacy_z).toEqual([14.4, 15.5]);
    });

    it("legacy schema dumping", async () => {
      const output = await dumpTableSchema("postgresql_points");
      expect(output).toMatch(/t\.point\("legacy_x"\);$/m);
      expect(output).toMatch(/t\.point\("legacy_y",\s+\{?\s*default: \[12\.2, 13\.3\] \}\);$/m);
      expect(output).toMatch(/t\.point\("legacy_z",\s+\{?\s*default: \[14\.4, 15\.5\] \}\);$/m);
    });

    it("legacy roundtrip", async () => {
      await PostgresqlPoint.createBang({ legacy_x: [10, 25.2] });
      const record = (await PostgresqlPoint.first())!;
      expect(record.legacy_x).toEqual([10, 25.2]);

      record.legacy_x = [1.1, 2.2];
      await record.saveBang();
      expect(await record.reload()).toBeTruthy();
      expect(record.legacy_x).toEqual([1.1, 2.2]);
    });

    it("legacy mutation", async () => {
      const p = await PostgresqlPoint.createBang({ legacy_x: [10, 20] });

      p.legacy_x[1] = 25;
      await p.saveBang();
      await p.reload();

      expect(p.legacy_x).toEqual([10.0, 25.0]);
      assertNotPredicate(p, (r) => r.isChanged);
    });
  });

  describe("PostgreSQLGeometricTypesTest", () => {
    const tableName = "testings";

    const assertColumnExists = async (columnName: string) => {
      expect(await adapter.columnExists(tableName, columnName)).toBeTruthy();
    };

    const assertTypeCorrect = async (columnName: string, type: string) => {
      const column = (await adapter.columns(tableName)).find((c) => c.name === columnName)!;
      expect(column.type).toBe(type);
    };

    it("creating column with point type", async () => {
      await adapter.dropTable(tableName, { ifExists: true });
      await adapter.createTable(tableName, (t: TableDefinition) => {
        t.point("foo_point");
      });

      await assertColumnExists("foo_point");
      await assertTypeCorrect("foo_point", "point");
      await adapter.dropTable(tableName, { ifExists: true });
    });

    it("creating column with line type", async () => {
      await adapter.dropTable(tableName, { ifExists: true });
      await adapter.createTable(tableName, (t: TableDefinition) => {
        t.line("foo_line");
      });

      await assertColumnExists("foo_line");
      await assertTypeCorrect("foo_line", "line");
      await adapter.dropTable(tableName, { ifExists: true });
    });

    it("creating column with lseg type", async () => {
      await adapter.dropTable(tableName, { ifExists: true });
      await adapter.createTable(tableName, (t: TableDefinition) => {
        t.lseg("foo_lseg");
      });

      await assertColumnExists("foo_lseg");
      await assertTypeCorrect("foo_lseg", "lseg");
      await adapter.dropTable(tableName, { ifExists: true });
    });

    it("creating column with box type", async () => {
      await adapter.dropTable(tableName, { ifExists: true });
      await adapter.createTable(tableName, (t: TableDefinition) => {
        t.box("foo_box");
      });

      await assertColumnExists("foo_box");
      await assertTypeCorrect("foo_box", "box");
      await adapter.dropTable(tableName, { ifExists: true });
    });

    it("creating column with path type", async () => {
      await adapter.dropTable(tableName, { ifExists: true });
      await adapter.createTable(tableName, (t: TableDefinition) => {
        t.path("foo_path");
      });

      await assertColumnExists("foo_path");
      await assertTypeCorrect("foo_path", "path");
      await adapter.dropTable(tableName, { ifExists: true });
    });

    it("creating column with polygon type", async () => {
      await adapter.dropTable(tableName, { ifExists: true });
      await adapter.createTable(tableName, (t: TableDefinition) => {
        t.polygon("foo_polygon");
      });

      await assertColumnExists("foo_polygon");
      await assertTypeCorrect("foo_polygon", "polygon");
      await adapter.dropTable(tableName, { ifExists: true });
    });

    it("creating column with circle type", async () => {
      await adapter.dropTable(tableName, { ifExists: true });
      await adapter.createTable(tableName, (t: TableDefinition) => {
        t.circle("foo_circle");
      });

      await assertColumnExists("foo_circle");
      await assertTypeCorrect("foo_circle", "circle");
      await adapter.dropTable(tableName, { ifExists: true });
    });
  });

  describe("PostgreSQLGeometricTest", () => {
    class PostgresqlGeometric extends Base {
      declare id: number;
      declare a_line_segment: string;
      declare a_box: string;
      declare a_path: string;
      declare a_polygon: string;
      declare a_circle: string;
      static {
        this.tableName = "postgresql_geometrics";
      }
    }

    beforeEach(async () => {
      await adapter.dropTable("postgresql_geometrics", { ifExists: true });
      await adapter.createTable("postgresql_geometrics", (t: TableDefinition) => {
        t.lseg("a_line_segment");
        t.box("a_box");
        t.path("a_path");
        t.polygon("a_polygon");
        t.circle("a_circle");
      });
      void PostgresqlGeometric.resetColumnInformation();
      await PostgresqlGeometric.loadSchema();
    });
    afterEach(async () => {
      await adapter.dropTable("postgresql_geometrics", { ifExists: true });
    });

    it("geometric types", async () => {
      const g = new PostgresqlGeometric({
        a_line_segment: "(2.0, 3), (5.5, 7.0)",
        a_box: "2.0, 3, 5.5, 7.0",
        a_path: "[(2.0, 3), (5.5, 7.0), (8.5, 11.0)]",
        a_polygon: "((2.0, 3), (5.5, 7.0), (8.5, 11.0))",
        a_circle: "<(5.3, 10.4), 2>",
      });

      await g.saveBang();

      const h = await PostgresqlGeometric.find(g.id);

      expect(h.a_line_segment).toBe("[(2,3),(5.5,7)]");
      expect(h.a_box).toBe("(5.5,7),(2,3)");
      expect(h.a_path).toBe("[(2,3),(5.5,7),(8.5,11)]");
      expect(h.a_polygon).toBe("((2,3),(5.5,7),(8.5,11))");
      expect(h.a_circle).toBe("<(5.3,10.4),2>");
    });

    it("alternative format", async () => {
      const g = new PostgresqlGeometric({
        a_line_segment: "((2.0, 3), (5.5, 7.0))",
        a_box: "(2.0, 3), (5.5, 7.0)",
        a_path: "((2.0, 3), (5.5, 7.0), (8.5, 11.0))",
        a_polygon: "2.0, 3, 5.5, 7.0, 8.5, 11.0",
        a_circle: "((5.3, 10.4), 2)",
      });

      await g.saveBang();

      const h = await PostgresqlGeometric.find(g.id);
      expect(h.a_line_segment).toBe("[(2,3),(5.5,7)]");
      expect(h.a_box).toBe("(5.5,7),(2,3)");
      expect(h.a_path).toBe("((2,3),(5.5,7),(8.5,11))");
      expect(h.a_polygon).toBe("((2,3),(5.5,7),(8.5,11))");
      expect(h.a_circle).toBe("<(5.3,10.4),2>");
    });

    it("geometric function", async () => {
      await PostgresqlGeometric.createBang({ a_path: "[(2.0, 3), (5.5, 7.0), (8.5, 11.0)]" });
      await PostgresqlGeometric.createBang({ a_path: "((2.0, 3), (5.5, 7.0), (8.5, 11.0))" });

      let objs = await PostgresqlGeometric.findBySql(
        "SELECT isopen(a_path) FROM postgresql_geometrics ORDER BY id ASC",
      );
      expect(objs.map((o) => (o as unknown as { isopen: boolean }).isopen)).toEqual([true, false]);

      objs = await PostgresqlGeometric.findBySql(
        "SELECT isclosed(a_path) FROM postgresql_geometrics ORDER BY id ASC",
      );
      expect(objs.map((o) => (o as unknown as { isclosed: boolean }).isclosed)).toEqual([
        false,
        true,
      ]);
    });

    it("schema dumping", async () => {
      const output = await dumpTableSchema("postgresql_geometrics");
      expect(output).toMatch(/t\.lseg\("a_line_segment"\);$/m);
      expect(output).toMatch(/t\.box\("a_box"\);$/m);
      expect(output).toMatch(/t\.path\("a_path"\);$/m);
      expect(output).toMatch(/t\.polygon\("a_polygon"\);$/m);
      expect(output).toMatch(/t\.circle\("a_circle"\);$/m);
    });
  });

  describe("PostgreSQLGeometricLineTest", () => {
    class PostgresqlLine extends Base {
      declare id: number;
      declare a_line: string;
      static {
        this.tableName = "postgresql_lines";
      }
    }

    let skipped = false;

    beforeEach(async (ctx) => {
      skipped = (await adapter.databaseVersion) < 9_04_00;
      if (skipped) ctx.skip();
      await adapter.dropTable("postgresql_lines", { ifExists: true });
      await adapter.createTable("postgresql_lines", (t: TableDefinition) => {
        t.line("a_line");
      });
      void PostgresqlLine.resetColumnInformation();
      await PostgresqlLine.loadSchema();
    });
    afterEach(async () => {
      if (skipped) return;
      await adapter.dropTable("postgresql_lines", { ifExists: true });
    });

    it("geometric line type", async () => {
      const g = new PostgresqlLine({ a_line: "{2.0, 3, 5.5}" });
      await g.saveBang();

      const h = await PostgresqlLine.find(g.id);
      expect(h.a_line).toBe("{2,3,5.5}");
    });

    it("alternative format line type", async () => {
      const g = new PostgresqlLine({ a_line: "(2.0, 3), (4.0, 6.0)" });
      await g.saveBang();

      const h = await PostgresqlLine.find(g.id);
      expect(h.a_line).toBe("{1.5,-1,0}");
    });

    it("schema dumping for line type", async () => {
      const output = await dumpTableSchema("postgresql_lines");
      expect(output).toMatch(/t\.line\("a_line"\);$/m);
    });
  });
});
