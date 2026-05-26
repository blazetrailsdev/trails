import { beforeAll, describe, expect, it, vi } from "vitest";
import { Visitors } from "@blazetrails/arel";
import { TypeMap } from "../type/type-map.js";
import {
  BooleanType,
  BinaryType,
  IntegerType,
  FloatType,
  DecimalType,
} from "@blazetrails/activemodel";
import { Text as TextType } from "../type/text.js";
import { Date as DateType } from "../type/date.js";
import { Time as TimeType } from "../type/time.js";
import { DateTime as DateTimeType } from "../type/date-time.js";
import { Json as JsonType } from "../type/json.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";
import { AbstractAdapter } from "./abstract-adapter.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { Result } from "../result.js";

// All 5 methods are class-level in Rails (class << self private), so test via a subclass.
class TestAdapter extends AbstractAdapter {
  static get adapterName() {
    return "TestAdapter";
  }
  override get adapterName() {
    return "TestAdapter" as const;
  }
}

describe("AbstractAdapter#returnValueAfterInsert", () => {
  it("returns true when column isAutoPopulated (has default function)", () => {
    const adapter = new TestAdapter();
    const col = new Column("id", null, new SqlTypeMetadata({ sqlType: "uuid" }), false, {
      defaultFunction: "gen_random_uuid()",
    });
    expect(adapter.returnValueAfterInsert(col)).toBe(true);
  });

  it("returns false when column is not auto-populated", () => {
    const adapter = new TestAdapter();
    const col = new Column("name", null, new SqlTypeMetadata({ sqlType: "varchar" }));
    expect(adapter.returnValueAfterInsert(col)).toBe(false);
  });
});

describe("AbstractAdapter.extractLimit", () => {
  it("parses limit from sql type with parens", () => {
    expect(TestAdapter.extractLimit("varchar(255)")).toBe(255);
  });

  it("returns undefined when no parens", () => {
    expect(TestAdapter.extractLimit("text")).toBeUndefined();
  });

  it("parses leading digits from decimal(10,2)", () => {
    expect(TestAdapter.extractLimit("decimal(10,2)")).toBe(10);
  });
});

describe("AbstractAdapter.extractPrecision", () => {
  it("returns first number for p,s form", () => {
    expect(TestAdapter.extractPrecision("decimal(10,2)")).toBe(10);
  });

  it("returns number for p-only form", () => {
    expect(TestAdapter.extractPrecision("decimal(10)")).toBe(10);
  });

  it("returns undefined when no parens", () => {
    expect(TestAdapter.extractPrecision("decimal")).toBeUndefined();
  });
});

describe("AbstractAdapter.extractScale", () => {
  it("returns second number for p,s form", () => {
    expect(TestAdapter.extractScale("decimal(10,2)")).toBe(2);
  });

  it("returns 0 for single-number form", () => {
    expect(TestAdapter.extractScale("decimal(10)")).toBe(0);
  });

  it("returns undefined when no parens", () => {
    expect(TestAdapter.extractScale("decimal")).toBeUndefined();
  });
});

describe("AbstractAdapter.registerClassWithLimit", () => {
  it("registers a type factory that extracts limit", () => {
    const m = new TypeMap();
    TestAdapter.registerClassWithLimit(m, /varchar/i, IntegerType);
    const type = m.lookup("varchar(64)");
    expect(type).toBeInstanceOf(IntegerType);
  });
});

describe("AbstractAdapter.initializeTypeMap", () => {
  let m: TypeMap;

  beforeAll(() => {
    m = new TypeMap();
    TestAdapter.initializeTypeMap(m);
  });

  it("registers boolean", () => {
    expect(m.lookup("boolean")).toBeInstanceOf(BooleanType);
  });

  it("registers text", () => {
    expect(m.lookup("text")).toBeInstanceOf(TextType);
  });

  it("registers binary", () => {
    expect(m.lookup("binary")).toBeInstanceOf(BinaryType);
  });

  it("registers float", () => {
    expect(m.lookup("float")).toBeInstanceOf(FloatType);
  });

  it("registers integer", () => {
    expect(m.lookup("integer")).toBeInstanceOf(IntegerType);
  });

  it("registers date", () => {
    expect(m.lookup("date")).toBeInstanceOf(DateType);
  });

  it("registers time", () => {
    expect(m.lookup("time")).toBeInstanceOf(TimeType);
  });

  it("registers datetime", () => {
    expect(m.lookup("datetime")).toBeInstanceOf(DateTimeType);
  });

  it("registers json", () => {
    expect(m.lookup("json")).toBeInstanceOf(JsonType);
  });

  it("registers decimal with scale as DecimalType", () => {
    expect(m.lookup("decimal(10,2)")).toBeInstanceOf(DecimalType);
  });

  it("registers decimal without scale as DecimalWithoutScale", () => {
    expect(m.lookup("decimal(10)")).toBeInstanceOf(DecimalWithoutScale);
  });

  it("aliases blob to binary", () => {
    expect(m.lookup("blob")).toBeInstanceOf(BinaryType);
  });

  it("aliases clob to text", () => {
    expect(m.lookup("clob")).toBeInstanceOf(TextType);
  });

  it("aliases timestamp to datetime", () => {
    expect(m.lookup("timestamp")).toBeInstanceOf(DateTimeType);
  });

  it("aliases double to float", () => {
    expect(m.lookup("double")).toBeInstanceOf(FloatType);
  });
});

describe("DatabaseStatements#insert id extraction", () => {
  // execInsert/execute are include()-mixed methods, not class declarations,
  // so we assign them via any rather than using class override syntax.
  class InsertTestAdapter extends AbstractAdapter {
    static get adapterName() {
      return "InsertTestAdapter";
    }
    override get adapterName() {
      return "InsertTestAdapter" as const;
    }
  }

  it("returns numeric insertId when execInsert returns a number", async () => {
    const adapter = new InsertTestAdapter() as any;
    adapter.execInsert = async () => 42;
    expect(await adapter.insert("INSERT INTO t VALUES (1)")).toBe(42);
  });

  it("respects idValue override when provided, regardless of execInsert return type", async () => {
    const adapter = new InsertTestAdapter() as any;
    adapter.execInsert = async () => 42;
    expect(await adapter.insert("INSERT INTO t VALUES (1)", null, null, 99)).toBe(99);
  });

  it("extracts id from Result via lastInsertedId when execInsert returns a Result", async () => {
    const adapter = new InsertTestAdapter() as any;
    adapter.execInsert = async () => new Result(["id"], [[99]]);
    expect(await adapter.insert("INSERT INTO t VALUES (1)")).toBe(99);
  });

  it("calls adapter lastInsertedId when present and execInsert returns a Result", async () => {
    const adapter = new InsertTestAdapter() as any;
    adapter.execInsert = async () => new Result(["id"], [[99]]);
    const customLastInserted = vi.fn().mockReturnValue(77);
    adapter.lastInsertedId = customLastInserted;
    expect(await adapter.insert("INSERT INTO t VALUES (1)")).toBe(77);
    expect(customLastInserted).toHaveBeenCalled();
  });
});

describe("per-adapter visitor isolation", () => {
  class SqliteAdapter extends AbstractAdapter {
    static get adapterName() {
      return "SQLite" as const;
    }
    override get adapterName() {
      return "sqlite" as const;
    }
    override arelVisitor() {
      return new Visitors.SQLite(this);
    }
  }

  class MysqlAdapter extends AbstractAdapter {
    static get adapterName() {
      return "MySQL" as const;
    }
    override get adapterName() {
      return "mysql" as const;
    }
    override arelVisitor() {
      return new Visitors.MySQL(this);
    }
  }

  it("each adapter caches its own dialect-specific visitor", () => {
    const sqlite = new SqliteAdapter();
    const mysql = new MysqlAdapter();

    expect(sqlite.visitor).toBeInstanceOf(Visitors.SQLite);
    expect(mysql.visitor).toBeInstanceOf(Visitors.MySQL);
  });

  it("constructing a second adapter does not overwrite the first adapter's visitor", () => {
    const sqlite = new SqliteAdapter();
    const visitorBefore = sqlite.visitor;
    new MysqlAdapter();
    expect(sqlite.visitor).toBe(visitorBefore);
    expect(sqlite.visitor).toBeInstanceOf(Visitors.SQLite);
  });
});
