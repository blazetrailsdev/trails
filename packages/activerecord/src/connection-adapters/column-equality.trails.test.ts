import { describe, it, expect } from "vitest";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { Column as PostgreSQLColumn } from "./postgresql/column.js";
import { Column as SQLite3Column } from "./sqlite3/column.js";

function meta(overrides: NonNullable<ConstructorParameters<typeof SqlTypeMetadata>[0]> = {}) {
  return new SqlTypeMetadata({ sqlType: "varchar(255)", type: "string", limit: 255, ...overrides });
}

describe("ColumnEqualityTrails", () => {
  it("compares every attribute Rails compares", () => {
    const base = () =>
      new Column("title", "hi", meta(), false, { comment: "c", collation: "utf8" });
    expect(base().equals(base())).toBe(true);

    expect(base().equals(new Column("other", "hi", meta(), false, { comment: "c" }))).toBe(false);
    expect(base().equals(new Column("title", "bye", meta(), false, { comment: "c" }))).toBe(false);
    expect(base().equals(new Column("title", "hi", meta({ limit: 10 }), false))).toBe(false);
    expect(base().equals(new Column("title", "hi", meta(), true, { comment: "c" }))).toBe(false);
    expect(base().equals(new Column("title", "hi", meta(), false, { comment: "other" }))).toBe(
      false,
    );
    expect(base().equals(new Column("title", "hi", meta(), false, { collation: "ascii" }))).toBe(
      false,
    );
    expect(
      base().equals(new Column("title", "hi", meta(), false, { defaultFunction: "now()" })),
    ).toBe(false);
  });

  it("ignores primaryKey, which Rails' Column does not carry", () => {
    const a = new Column("id", null, meta(), false, { primaryKey: true });
    const b = new Column("id", null, meta(), false, { primaryKey: false });
    expect(a.equals(b)).toBe(true);
  });

  it("is not equal to a non-Column", () => {
    const column = new Column("title", null, meta());
    expect(column.equals(null)).toBe(false);
    expect(column.equals("title")).toBe(false);
    expect(column.equals({ name: "title" })).toBe(false);
  });

  it("treats a null sqlTypeMetadata as equal only to another null one", () => {
    expect(new Column("a", null, null).equals(new Column("a", null, null))).toBe(true);
    expect(new Column("a", null, null).equals(new Column("a", null, meta()))).toBe(false);
    expect(new Column("a", null, meta()).equals(new Column("a", null, null))).toBe(false);
  });

  it("compares SqlTypeMetadata by value", () => {
    expect(meta().equals(meta())).toBe(true);
    expect(meta().equals(meta({ sqlType: "text" }))).toBe(false);
    expect(meta().equals(meta({ type: "text" }))).toBe(false);
    expect(meta().equals(meta({ limit: 10 }))).toBe(false);
    expect(meta().equals(meta({ precision: 2 }))).toBe(false);
    expect(meta().equals(meta({ scale: 2 }))).toBe(false);
    expect(meta().equals(null)).toBe(false);
    expect(meta().equals({ sqlType: "varchar(255)" })).toBe(false);
  });

  it("narrows the guard to the adapter class in PostgreSQL::Column", () => {
    const pg = new PostgreSQLColumn("id", null, { sqlType: "integer", type: "integer" }, false);
    const metadata = new SqlTypeMetadata({ sqlType: "integer", type: "integer" });
    const base = new Column("id", null, metadata, false);
    expect(pg.equals(base)).toBe(false);
    expect(base.equals(pg)).toBe(true);
  });

  it("compares the PostgreSQL identity and serial flags", () => {
    const opts = { sqlType: "integer", type: "integer" };
    const plain = new PostgreSQLColumn("id", null, opts, false);
    expect(plain.equals(new PostgreSQLColumn("id", null, opts, false))).toBe(true);
    expect(plain.equals(new PostgreSQLColumn("id", null, opts, false, { serial: true }))).toBe(
      false,
    );
    expect(plain.equals(new PostgreSQLColumn("id", null, opts, false, { identity: "a" }))).toBe(
      false,
    );
  });

  it("compares the SQLite3 autoIncrement flag", () => {
    const opts = { sqlType: "integer", type: "integer" };
    const plain = new SQLite3Column("id", null, opts, false);
    expect(plain.equals(new SQLite3Column("id", null, opts, false))).toBe(true);
    expect(plain.equals(new SQLite3Column("id", null, opts, false, { autoIncrement: true }))).toBe(
      false,
    );
    expect(plain.equals(new SQLite3Column("id", null, opts, false, { rowid: true }))).toBe(true);
  });

  it("does not equal a sibling adapter's column", () => {
    const opts = { sqlType: "integer", type: "integer" };
    const pg = new PostgreSQLColumn("id", null, opts, false);
    const sqlite = new SQLite3Column("id", null, opts, false);
    expect(pg.equals(sqlite)).toBe(false);
    expect(sqlite.equals(pg)).toBe(false);
  });
});
