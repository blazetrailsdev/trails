import { describe, it, expect, vi } from "vitest";
import { Column, NullColumn } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";

function makeMetadata(
  overrides: {
    sqlType?: string;
    type?: string;
    limit?: number | null;
    precision?: number | null;
    scale?: number | null;
  } = {},
): SqlTypeMetadata {
  return new SqlTypeMetadata({
    sqlType: "varchar",
    type: "string",
    ...overrides,
  });
}

describe("Column", () => {
  it("isBigint returns true for bigint sql_type", () => {
    const col = new Column("id", null, makeMetadata({ sqlType: "bigint" }));
    expect(col.isBigint()).toBe(true);
  });

  it("isBigint returns true for bigint with extra info", () => {
    const col = new Column("id", null, makeMetadata({ sqlType: "bigint unsigned" }));
    expect(col.isBigint()).toBe(true);
  });

  it("isBigint returns false for integer sql_type", () => {
    const col = new Column("id", null, makeMetadata({ sqlType: "integer" }));
    expect(col.isBigint()).toBe(false);
  });

  it("isBigint returns false when no sql_type_metadata", () => {
    const col = new Column("id", null);
    expect(col.isBigint()).toBe(false);
  });

  it("humanName converts underscore name to human form", () => {
    const col = new Column("first_name", null, makeMetadata());
    expect(col.humanName()).toBe("First name");
  });

  it("humanName handles simple name", () => {
    const col = new Column("email", null, makeMetadata());
    expect(col.humanName()).toBe("Email");
  });

  it("isAutoIncrementedByDb returns false by default", () => {
    const col = new Column("id", null, makeMetadata());
    expect(col.isAutoIncrementedByDb()).toBe(false);
  });

  it("isAutoPopulated returns false when no default function", () => {
    const col = new Column("name", null, makeMetadata());
    expect(col.isAutoPopulated()).toBe(false);
  });

  it("isAutoPopulated returns true when default function set", () => {
    const col = new Column("created_at", null, makeMetadata(), true, {
      defaultFunction: "now()",
    });
    expect(col.isAutoPopulated()).toBe(true);
  });

  it("isVirtual returns false by default", () => {
    const col = new Column("name", null, makeMetadata());
    expect(col.isVirtual()).toBe(false);
  });

  it("type returns semantic type, not raw sql type", () => {
    const col = new Column(
      "created_at",
      null,
      new SqlTypeMetadata({ sqlType: "timestamp without time zone", type: "datetime" }),
    );
    expect(col.type).toBe("datetime");
    expect(col.sqlType).toBe("timestamp without time zone");
  });

  it("type falls back to sqlType when no semantic type is set", () => {
    const col = new Column("body", null, new SqlTypeMetadata({ sqlType: "text" }));
    expect(col.type).toBe("text");
  });

  it("type returns null when no sqlTypeMetadata", () => {
    const col = new Column("name", null);
    expect(col.type).toBeNull();
  });
});

describe("NullColumn", () => {
  it("has empty name", () => {
    const col = new NullColumn();
    expect(col.name).toBe("");
  });

  it("has null default", () => {
    const col = new NullColumn();
    expect(col.default).toBeNull();
  });

  it("deduplicate returns self and triggers sqlTypeMetadata deduplication", () => {
    const meta = makeMetadata();
    const col = new Column("name", null, meta);
    const spy = vi.spyOn(meta, "deduplicate");
    const result = col.deduplicate();
    expect(result).toBe(col);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("deduplicate is a no-op when sqlTypeMetadata is null", () => {
    const col = new Column("name", null, null);
    expect(() => col.deduplicate()).not.toThrow();
    expect(col.deduplicate()).toBe(col);
  });
});
