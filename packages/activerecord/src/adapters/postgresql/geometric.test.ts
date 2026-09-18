import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNotPredicate } from "@blazetrails/activesupport";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { TableDefinition } from "../../connection-adapters/postgresql/schema-definitions.js";
import { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import { PointValue } from "../../connection-adapters/postgresql/oid/point.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
  });

  describe("PostgreSQLPointTest", () => {
    class PostgresqlPoint extends Base {
      declare x: PointValue;
      declare y: PointValue;
      declare z: PointValue;
      declare array_of_points: PointValue[];
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
      expect(PostgresqlPoint.columnDefaults["y"]).toEqual(new PointValue(12.2, 13.3));
      expect(new PostgresqlPoint().y).toEqual(new PointValue(12.2, 13.3));

      expect(PostgresqlPoint.columnDefaults["z"]).toEqual(new PointValue(14.4, 15.5));
      expect(new PostgresqlPoint().z).toEqual(new PointValue(14.4, 15.5));
    });

    it("schema dumping", async () => {
      const output = await dumpTableSchema(adapter, "postgresql_points");
      expect(output).toMatch(/t\.point\("x"\);$/m);
      expect(output).toMatch(/t\.point\("y",\s+\{?\s*default: \[12\.2, 13\.3\] \}\);$/m);
      expect(output).toMatch(/t\.point\("z",\s+\{?\s*default: \[14\.4, 15\.5\] \}\);$/m);
    });

    it("roundtrip", async () => {
      await PostgresqlPoint.createBang({ x: [10, 25.2] });
      const record = (await PostgresqlPoint.first())!;
      expect(record.x).toEqual(new PointValue(10, 25.2));

      record.x = new PointValue(1.1, 2.2);
      await record.saveBang();
      expect(await record.reload()).toBeTruthy();
      expect(record.x).toEqual(new PointValue(1.1, 2.2));
    });

    it.skip("mutation", async () => {
      // BLOCKED: in-place mutation of a point attribute stays dirty after save! + reload (filed as 0155-assertion-surfaced-port-bugs/pg-point-mutation-dirty-after-reload)
      const p = await PostgresqlPoint.createBang({ x: new PointValue(10, 20) });

      p.x.y = 25;
      await p.saveBang();
      await p.reload();

      expect(p.x).toEqual(new PointValue(10.0, 25.0));
      assertNotPredicate(p, (r) => r.isChanged);
    });

    it("array assignment", () => {
      const p = new PostgresqlPoint({ x: [1, 2] });

      expect(p.x).toEqual(new PointValue(1, 2));
    });

    it("hash assignment", () => {
      const p = new PostgresqlPoint({ x: { x: 1, y: 2 }, y: { x: 3, y: 4 } });

      expect(p.x).toEqual(new PointValue(1, 2));
      expect(p.y).toEqual(new PointValue(3, 4));
    });

    it("string assignment", () => {
      const p = new PostgresqlPoint({ x: "(1, 2)" });

      expect(p.x).toEqual(new PointValue(1, 2));
    });

    it("empty string assignment", () => {
      const p = new PostgresqlPoint({ x: "" });
      expect(p.x).toBeNull();
    });

    it("array of points round trip", async () => {
      const expectedValue = [new PointValue(1, 2), new PointValue(2, 3), new PointValue(3, 4)];
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
      const output = await dumpTableSchema(adapter, "postgresql_points");
      expect(output).toMatch(/t\.point\("legacy_x"\);$/m);
      expect(output).toMatch(/t\.point\("legacy_y",\s+\{?\s*default: \[12\.2, 13\.3\] \}\);$/m);
      expect(output).toMatch(/t\.point\("legacy_z",\s+\{?\s*default: \[14\.4, 15\.5\] \}\);$/m);
    });

    it.skip("legacy roundtrip", async () => {
      // BLOCKED: a :legacy_point attribute reads back a PointValue where Rails returns [x, y] (filed as 0155-assertion-surfaced-port-bugs/pg-legacy-point-attribute-type-resolution)
      await PostgresqlPoint.createBang({ legacy_x: [10, 25.2] });
      const record = (await PostgresqlPoint.first())!;
      expect(record.legacy_x).toEqual([10, 25.2]);

      record.legacy_x = [1.1, 2.2];
      await record.saveBang();
      expect(await record.reload()).toBeTruthy();
      expect(record.legacy_x).toEqual([1.1, 2.2]);
    });

    it.skip("legacy mutation", async () => {
      // BLOCKED: a :legacy_point attribute reads back a PointValue where Rails returns [x, y] (filed as 0155-assertion-surfaced-port-bugs/pg-legacy-point-attribute-type-resolution)
      const p = await PostgresqlPoint.createBang({ legacy_x: [10, 20] });

      p.legacy_x[1] = 25;
      await p.saveBang();
      await p.reload();

      expect(p.legacy_x).toEqual([10.0, 25.0]);
      assertNotPredicate(p, (r) => r.isChanged);
    });
  });

  describe("PostgreSQLGeometricTypesTest", () => {
    afterEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
    });

    it("line column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_line'
      `);
      expect(rows[0].udt_name).toBe("line");
    });

    it("line default", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (
          id serial primary key,
          a_line line DEFAULT '{1,2,3}'
        )
      `);
      const rows = await adapter.execute(`
        SELECT column_default FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_line'
      `);
      expect(rows[0].column_default).toBeTruthy();
    });

    it("line type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_line) VALUES ($1)`, "SQL", [
        "{2,3,5.5}",
      ]);
      const rows = await adapter.execute(`SELECT a_line FROM test_geometric_types`);
      expect(rows[0].a_line).toMatch(/2.*3.*5\.5/);
    });

    it("line write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_line) VALUES ($1)`, "SQL", [
        "{1,2,3}",
      ]);
      const rows = await adapter.execute(`SELECT a_line FROM test_geometric_types`);
      expect(rows[0].a_line).toBeTruthy();
    });

    it("lseg column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_lseg'
      `);
      expect(rows[0].udt_name).toBe("lseg");
    });

    it("lseg type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_lseg) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_lseg FROM test_geometric_types`);
      expect(rows[0].a_lseg).toMatch(/1.*2.*3.*4/);
    });

    it("lseg write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_lseg) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_lseg FROM test_geometric_types`);
      expect(rows[0].a_lseg).toBeTruthy();
    });

    it("box column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_box'
      `);
      expect(rows[0].udt_name).toBe("box");
    });

    it("box type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_box) VALUES ($1)`, "SQL", [
        "(3,4),(1,2)",
      ]);
      const rows = await adapter.execute(`SELECT a_box FROM test_geometric_types`);
      expect(rows[0].a_box).toMatch(/3.*4.*1.*2/);
    });

    it("box write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_box) VALUES ($1)`, "SQL", [
        "(3,4),(1,2)",
      ]);
      const rows = await adapter.execute(`SELECT a_box FROM test_geometric_types`);
      expect(rows[0].a_box).toBeTruthy();
    });

    it("path column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_path'
      `);
      expect(rows[0].udt_name).toBe("path");
    });

    it("path open", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4),(5,6)]",
      ]);
      const rows = await adapter.execute(
        `SELECT isopen(a_path) AS is_open FROM test_geometric_types`,
      );
      expect(rows[0].is_open).toBe(true);
    });

    it("path closed", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, "SQL", [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(
        `SELECT isclosed(a_path) AS is_closed FROM test_geometric_types`,
      );
      expect(rows[0].is_closed).toBe(true);
    });

    it("path type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_path FROM test_geometric_types`);
      expect(rows[0].a_path).toMatch(/1.*2.*3.*4/);
    });

    it("path write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, "SQL", [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_path FROM test_geometric_types`);
      expect(rows[0].a_path).toBeTruthy();
    });

    it("polygon column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_polygon'
      `);
      expect(rows[0].udt_name).toBe("polygon");
    });

    it("polygon type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_polygon) VALUES ($1)`, "SQL", [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(`SELECT a_polygon FROM test_geometric_types`);
      expect(rows[0].a_polygon).toMatch(/1.*2.*3.*4.*5.*6/);
    });

    it("polygon write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_polygon) VALUES ($1)`, "SQL", [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(`SELECT a_polygon FROM test_geometric_types`);
      expect(rows[0].a_polygon).toBeTruthy();
    });

    it("circle column", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_circle'
      `);
      expect(rows[0].udt_name).toBe("circle");
    });

    it("circle type cast", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_circle) VALUES ($1)`, "SQL", [
        "<(1,2),3>",
      ]);
      const rows = await adapter.execute(`SELECT a_circle FROM test_geometric_types`);
      const circle = rows[0].a_circle;
      const str = typeof circle === "object" ? JSON.stringify(circle) : String(circle);
      expect(str).toMatch(/1.*2.*3/);
    });

    it("circle write", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      await adapter.execQuery(`INSERT INTO test_geometric_types (a_circle) VALUES ($1)`, "SQL", [
        "<(1,2),3>",
      ]);
      const rows = await adapter.execute(`SELECT a_circle FROM test_geometric_types`);
      expect(rows[0].a_circle).toBeTruthy();
    });

    it("geometric nil", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.execute(`
        CREATE TABLE test_geometric_types (id serial primary key, a_point point)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_point) VALUES (NULL)`);
      const rows = await adapter.execute(`SELECT a_point FROM test_geometric_types`);
      expect(rows[0].a_point).toBeNull();
    });

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

    it.skip("geometric types", async () => {
      // BLOCKED: circle column reads back as an object, not the '<(x,y),r>' string (filed as 0155-assertion-surfaced-port-bugs/pg-circle-column-reads-object)
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

    it.skip("alternative format", async () => {
      // BLOCKED: circle column reads back as an object, not the '<(x,y),r>' string (filed as 0155-assertion-surfaced-port-bugs/pg-circle-column-reads-object)
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
      const output = await dumpTableSchema(adapter, "postgresql_geometrics");
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
      const output = await dumpTableSchema(adapter, "postgresql_lines");
      expect(output).toMatch(/t\.line\("a_line"\);$/m);
    });
  });
});
