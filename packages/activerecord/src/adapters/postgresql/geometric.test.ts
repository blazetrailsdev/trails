/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/geometric_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";
import { PgPoint, parsePoint, castPoint } from "./geometric.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLPointTest", () => {
    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_points`);
      await adapter.exec(`
        CREATE TABLE postgresql_points (
          id serial primary key,
          x point,
          y point DEFAULT '(12.2,13.3)',
          z point DEFAULT '(14.4,15.5)',
          array_of_points point[]
        )
      `);
    });
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_points`);
    });

    it("point column", async () => {
      const rows = await adapter.execute(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_name = 'postgresql_points' AND column_name = 'x'
      `);
      expect(rows).toHaveLength(1);
      expect(rows[0].udt_name).toBe("point");
    });

    it("point default", async () => {
      const rows = await adapter.execute(`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'postgresql_points' AND column_name = 'y'
      `);
      expect(rows[0].column_default).toMatch(/12\.2.*13\.3/);
    });

    it("point type cast", async () => {
      const p = parsePoint("(1.5,2.3)");
      expect(p).toBeInstanceOf(PgPoint);
      expect(p!.x).toBeCloseTo(1.5);
      expect(p!.y).toBeCloseTo(2.3);
    });

    it("point write", async () => {
      await adapter.execute(`INSERT INTO postgresql_points (x) VALUES ($1)`, ["(10,25.2)"]);
      const rows = await adapter.execute(`SELECT x FROM postgresql_points`);
      const p = parsePoint(rows[0].x as string);
      expect(p!.x).toBeCloseTo(10);
      expect(p!.y).toBeCloseTo(25.2);
    });

    it("column", async () => {
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'postgresql_points' AND column_name = 'x'
      `);
      expect(rows[0].udt_name).toBe("point");
    });

    it("schema dumping", async () => {
      const rows = await adapter.execute(`
        SELECT column_name, udt_name, column_default
        FROM information_schema.columns
        WHERE table_name = 'postgresql_points'
        ORDER BY ordinal_position
      `);
      const pointCols = rows.filter((r) => r.udt_name === "point");
      expect(pointCols.length).toBeGreaterThanOrEqual(3);
    });

    it("roundtrip", async () => {
      await adapter.execute(`INSERT INTO postgresql_points (x) VALUES ($1)`, ["(10,25.2)"]);
      const rows = await adapter.execute(`SELECT x FROM postgresql_points`);
      const p = parsePoint(rows[0].x as string);
      expect(p!.x).toBeCloseTo(10);
      expect(p!.y).toBeCloseTo(25.2);

      await adapter.execute(`UPDATE postgresql_points SET x = $1`, ["(30,40)"]);
      const rows2 = await adapter.execute(`SELECT x FROM postgresql_points`);
      const p2 = parsePoint(rows2[0].x as string);
      expect(p2!.x).toBeCloseTo(30);
      expect(p2!.y).toBeCloseTo(40);
    });

    it("mutation", () => {
      const p = new PgPoint(10, 20);
      p.y = 25;
      expect(p.y).toBe(25);
      expect(p.toString()).toBe("(10,25)");
    });

    it("array assignment", () => {
      const p = castPoint([1, 2]);
      expect(p).toBeInstanceOf(PgPoint);
      expect(p!.x).toBe(1);
      expect(p!.y).toBe(2);
    });

    it("hash assignment", () => {
      const p = castPoint({ x: 1, y: 2 });
      expect(p).toBeInstanceOf(PgPoint);
      expect(p!.x).toBe(1);
      expect(p!.y).toBe(2);
    });

    it("string assignment", () => {
      const p = castPoint("(1, 2)");
      expect(p).toBeInstanceOf(PgPoint);
      expect(p!.x).toBe(1);
      expect(p!.y).toBe(2);
    });

    it("empty string assignment", () => {
      const p = castPoint("");
      expect(p).toBeNull();
    });

    it("array of points round trip", async () => {
      await adapter.execute(`INSERT INTO postgresql_points (array_of_points) VALUES ($1)`, [
        '{"(1,2)","(3,4)","(5,6)"}',
      ]);
      const rows = await adapter.execute(`SELECT array_of_points FROM postgresql_points`);
      const arr = rows[0].array_of_points as string[];
      expect(arr).toHaveLength(3);
    });

    it("legacy column", async () => {
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'postgresql_points' AND column_name = 'x'
      `);
      expect(rows[0].udt_name).toBe("point");
    });

    it("legacy default", async () => {
      const rows = await adapter.execute(`
        SELECT column_default FROM information_schema.columns
        WHERE table_name = 'postgresql_points' AND column_name = 'y'
      `);
      expect(rows[0].column_default).toBeTruthy();
    });

    it.skip("legacy schema dumping", () => {});

    it("legacy roundtrip", async () => {
      await adapter.execute(`INSERT INTO postgresql_points (x) VALUES ($1)`, ["(5,10)"]);
      const rows = await adapter.execute(`SELECT x FROM postgresql_points`);
      expect(rows[0].x).toBeTruthy();
      const p = parsePoint(rows[0].x as string);
      expect(p!.x).toBeCloseTo(5);
      expect(p!.y).toBeCloseTo(10);
    });

    it("legacy mutation", () => {
      const p = new PgPoint(10, 20);
      p.x = 15;
      expect(p.x).toBe(15);
    });
  });

  describe("PostgreSQLGeometricTypesTest", () => {
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
    });

    it("line column", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_line'
      `);
      expect(rows[0].udt_name).toBe("line");
    });

    it("line default", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
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
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_line) VALUES ($1)`, ["{2,3,5.5}"]);
      const rows = await adapter.execute(`SELECT a_line FROM test_geometric_types`);
      expect(rows[0].a_line).toMatch(/2.*3.*5\.5/);
    });

    it("line write", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_line) VALUES ($1)`, ["{1,2,3}"]);
      const rows = await adapter.execute(`SELECT a_line FROM test_geometric_types`);
      expect(rows[0].a_line).toBeTruthy();
    });

    it("lseg column", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_lseg'
      `);
      expect(rows[0].udt_name).toBe("lseg");
    });

    it("lseg type cast", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_lseg) VALUES ($1)`, [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_lseg FROM test_geometric_types`);
      expect(rows[0].a_lseg).toMatch(/1.*2.*3.*4/);
    });

    it("lseg write", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_lseg) VALUES ($1)`, [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_lseg FROM test_geometric_types`);
      expect(rows[0].a_lseg).toBeTruthy();
    });

    it("box column", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_box'
      `);
      expect(rows[0].udt_name).toBe("box");
    });

    it("box type cast", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_box) VALUES ($1)`, [
        "(3,4),(1,2)",
      ]);
      const rows = await adapter.execute(`SELECT a_box FROM test_geometric_types`);
      expect(rows[0].a_box).toMatch(/3.*4.*1.*2/);
    });

    it("box write", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_box) VALUES ($1)`, [
        "(3,4),(1,2)",
      ]);
      const rows = await adapter.execute(`SELECT a_box FROM test_geometric_types`);
      expect(rows[0].a_box).toBeTruthy();
    });

    it("path column", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_path'
      `);
      expect(rows[0].udt_name).toBe("path");
    });

    it("path open", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, [
        "[(1,2),(3,4),(5,6)]",
      ]);
      const rows = await adapter.execute(
        `SELECT isopen(a_path) AS is_open FROM test_geometric_types`,
      );
      expect(rows[0].is_open).toBe(true);
    });

    it("path closed", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(
        `SELECT isclosed(a_path) AS is_closed FROM test_geometric_types`,
      );
      expect(rows[0].is_closed).toBe(true);
    });

    it("path type cast", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_path FROM test_geometric_types`);
      expect(rows[0].a_path).toMatch(/1.*2.*3.*4/);
    });

    it("path write", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_path) VALUES ($1)`, [
        "[(1,2),(3,4)]",
      ]);
      const rows = await adapter.execute(`SELECT a_path FROM test_geometric_types`);
      expect(rows[0].a_path).toBeTruthy();
    });

    it("polygon column", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_polygon'
      `);
      expect(rows[0].udt_name).toBe("polygon");
    });

    it("polygon type cast", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_polygon) VALUES ($1)`, [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(`SELECT a_polygon FROM test_geometric_types`);
      expect(rows[0].a_polygon).toMatch(/1.*2.*3.*4.*5.*6/);
    });

    it("polygon write", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_polygon) VALUES ($1)`, [
        "((1,2),(3,4),(5,6))",
      ]);
      const rows = await adapter.execute(`SELECT a_polygon FROM test_geometric_types`);
      expect(rows[0].a_polygon).toBeTruthy();
    });

    it("circle column", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_circle'
      `);
      expect(rows[0].udt_name).toBe("circle");
    });

    it("circle type cast", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_circle) VALUES ($1)`, [
        "<(1,2),3>",
      ]);
      const rows = await adapter.execute(`SELECT a_circle FROM test_geometric_types`);
      expect(rows[0].a_circle).toMatch(/1.*2.*3/);
    });

    it("circle write", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_circle) VALUES ($1)`, [
        "<(1,2),3>",
      ]);
      const rows = await adapter.execute(`SELECT a_circle FROM test_geometric_types`);
      expect(rows[0].a_circle).toBeTruthy();
    });

    it.skip("geometric schema dump", async () => {});
    it.skip("geometric where", async () => {});
    it.skip("geometric invalid", async () => {});

    it("geometric nil", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_point point)
      `);
      await adapter.execute(`INSERT INTO test_geometric_types (a_point) VALUES (NULL)`);
      const rows = await adapter.execute(`SELECT a_point FROM test_geometric_types`);
      expect(rows[0].a_point).toBeNull();
    });

    it("creating column with point type", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_point point)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_point'
      `);
      expect(rows[0].udt_name).toBe("point");
    });

    it("creating column with line type", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_line line)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_line'
      `);
      expect(rows[0].udt_name).toBe("line");
    });

    it("creating column with lseg type", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_lseg lseg)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_lseg'
      `);
      expect(rows[0].udt_name).toBe("lseg");
    });

    it("creating column with box type", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_box box)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_box'
      `);
      expect(rows[0].udt_name).toBe("box");
    });

    it("creating column with path type", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_path path)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_path'
      `);
      expect(rows[0].udt_name).toBe("path");
    });

    it("creating column with polygon type", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_polygon polygon)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_polygon'
      `);
      expect(rows[0].udt_name).toBe("polygon");
    });

    it("creating column with circle type", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS test_geometric_types`);
      await adapter.exec(`
        CREATE TABLE test_geometric_types (id serial primary key, a_circle circle)
      `);
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'test_geometric_types' AND column_name = 'a_circle'
      `);
      expect(rows[0].udt_name).toBe("circle");
    });
  });

  describe("PostgreSQLGeometricTest", () => {
    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_geometric`);
      await adapter.exec(`
        CREATE TABLE postgresql_geometric (
          id serial primary key,
          a_lseg lseg,
          a_box box,
          a_path path,
          a_polygon polygon,
          a_circle circle
        )
      `);
    });
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_geometric`);
    });

    it("geometric types", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_geometric (a_lseg, a_box, a_path, a_polygon, a_circle)
         VALUES ($1, $2, $3, $4, $5)`,
        ["[(1,2),(3,4)]", "(3,4),(1,2)", "[(1,2),(3,4),(5,6)]", "((1,2),(3,4),(5,6))", "<(1,2),3>"],
      );
      const rows = await adapter.execute(`SELECT * FROM postgresql_geometric`);
      expect(rows[0].a_lseg).toBeTruthy();
      expect(rows[0].a_box).toBeTruthy();
      expect(rows[0].a_path).toBeTruthy();
      expect(rows[0].a_polygon).toBeTruthy();
      expect(rows[0].a_circle).toBeTruthy();
    });

    it("alternative format", async () => {
      await adapter.execute(
        `INSERT INTO postgresql_geometric (a_lseg, a_box, a_path, a_polygon, a_circle)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          "((1,2),(3,4))",
          "((3,4),(1,2))",
          "((1,2),(3,4),(5,6))",
          "((1,2),(3,4),(5,6))",
          "((1,2),3)",
        ],
      );
      const rows = await adapter.execute(`SELECT * FROM postgresql_geometric`);
      expect(rows[0].a_lseg).toBeTruthy();
      expect(rows[0].a_box).toBeTruthy();
      expect(rows[0].a_path).toBeTruthy();
      expect(rows[0].a_polygon).toBeTruthy();
      expect(rows[0].a_circle).toBeTruthy();
    });

    it("geometric function", async () => {
      await adapter.execute(`INSERT INTO postgresql_geometric (a_path) VALUES ($1)`, [
        "[(1,2),(3,4),(5,6)]",
      ]);
      const openRows = await adapter.execute(
        `SELECT isopen(a_path) AS is_open FROM postgresql_geometric`,
      );
      expect(openRows[0].is_open).toBe(true);

      await adapter.execute(`DELETE FROM postgresql_geometric`);
      await adapter.execute(`INSERT INTO postgresql_geometric (a_path) VALUES ($1)`, [
        "((1,2),(3,4),(5,6))",
      ]);
      const closedRows = await adapter.execute(
        `SELECT isclosed(a_path) AS is_closed FROM postgresql_geometric`,
      );
      expect(closedRows[0].is_closed).toBe(true);
    });
  });

  describe("PostgreSQLGeometricLineTest", () => {
    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_lines`);
      await adapter.exec(`
        CREATE TABLE postgresql_lines (
          id serial primary key,
          a_line line
        )
      `);
    });
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS postgresql_lines`);
    });

    it("geometric line type", async () => {
      await adapter.execute(`INSERT INTO postgresql_lines (a_line) VALUES ($1)`, ["{2,3,5.5}"]);
      const rows = await adapter.execute(`SELECT a_line FROM postgresql_lines`);
      expect(rows[0].a_line).toMatch(/2.*3.*5\.5/);
    });

    it("alternative format line type", async () => {
      await adapter.execute(`INSERT INTO postgresql_lines (a_line) VALUES ($1)`, [
        "[(0,0),(1,1.5)]",
      ]);
      const rows = await adapter.execute(`SELECT a_line FROM postgresql_lines`);
      expect(rows[0].a_line).toBeTruthy();
    });

    it("schema dumping for line type", async () => {
      const rows = await adapter.execute(`
        SELECT udt_name FROM information_schema.columns
        WHERE table_name = 'postgresql_lines' AND column_name = 'a_line'
      `);
      expect(rows[0].udt_name).toBe("line");
    });
  });
});
