import { describe, it, expect } from "vitest";
import {
  IndexDefinition,
  ReferenceDefinition,
  TableDefinition,
  Table,
} from "./schema-definitions.js";

describe("IndexDefinition#concise_options", () => {
  it("keeps hash when values differ", () => {
    const idx = new IndexDefinition("t", "i", false, ["a", "b"], {
      orders: { a: "asc", b: "desc" },
    });
    expect(idx.orders).toEqual({ a: "asc", b: "desc" });
  });

  it("keeps hash when column count differs from options count", () => {
    const idx = new IndexDefinition("t", "i", false, ["a", "b", "c"], {
      orders: { a: "asc", b: "asc" },
    });
    expect(idx.orders).toEqual({ a: "asc", b: "asc" });
  });

  it("collapses to scalar when all values are identical and count matches columns", () => {
    const idx = new IndexDefinition("t", "i", false, ["a", "b"], {
      orders: { a: "asc", b: "asc" },
    });
    expect(idx.orders).toBe("asc");
  });
});

describe("ReferenceDefinition helpers", () => {
  it("addTo adds id column by default", () => {
    const ref = new ReferenceDefinition("user", { index: false });
    const td = new TableDefinition("posts", { id: false });
    ref.addTo(td);
    expect(td.columns.map((c) => c.name)).toContain("user_id");
  });

  it("addTo adds type column when polymorphic", () => {
    const ref = new ReferenceDefinition("taggable", { polymorphic: true, index: false });
    const td = new TableDefinition("taggings", { id: false });
    ref.addTo(td);
    const names = td.columns.map((c) => c.name);
    expect(names).toContain("taggable_id");
    expect(names).toContain("taggable_type");
  });

  it("addTo adds index with polymorphic name", () => {
    const ref = new ReferenceDefinition("taggable", { polymorphic: true });
    const td = new TableDefinition("taggings", { id: false });
    ref.addTo(td);
    expect(td.indexes[0].name).toBe("index_taggings_on_taggable");
  });

  it("addTo adds foreign key when foreignKey: true", () => {
    const ref = new ReferenceDefinition("user", { foreignKey: true, index: false });
    const td = new TableDefinition("posts", { id: false });
    ref.addTo(td);
    expect(td.foreignKeys).toHaveLength(1);
    expect(td.foreignKeys[0].toTable).toBe("users");
  });

  it("addTo respects toTable in foreignKey options", () => {
    const ref = new ReferenceDefinition("author", {
      foreignKey: { toTable: "accounts" },
      index: false,
    });
    const td = new TableDefinition("posts", { id: false });
    ref.addTo(td);
    expect(td.foreignKeys[0].toTable).toBe("accounts");
  });

  it("raises when both polymorphic and foreignKey are set", () => {
    expect(
      () => new ReferenceDefinition("taggable", { polymorphic: true, foreignKey: true }),
    ).toThrow("Cannot add a foreign key to a polymorphic relation");
  });

  it("polymorphic columns are ordered type before id", () => {
    const ref = new ReferenceDefinition("taggable", { polymorphic: true, index: false });
    const td = new TableDefinition("taggings", { id: false });
    ref.addTo(td);
    expect(td.columns[0].name).toBe("taggable_type");
    expect(td.columns[1].name).toBe("taggable_id");
  });
});

describe("TableDefinition#toSql blank type guard", () => {
  it("throws a descriptive error for an empty custom type", () => {
    const td = new TableDefinition("t", { id: false });
    td.column("bad", "" as any);
    expect(() => td.toSql()).toThrow(/Column "bad" has an empty or blank type/);
  });

  it("throws a descriptive error for a whitespace-only custom type", () => {
    const td = new TableDefinition("t", { id: false });
    td.column("bad", "   " as any);
    expect(() => td.toSql()).toThrow(/Column "bad" has an empty or blank type/);
  });
});

describe("TableDefinition#raise_on_duplicate_column", () => {
  it("raises when adding a duplicate non-pk column", () => {
    const td = new TableDefinition("t", { id: false });
    td.string("name");
    expect(() => td.string("name")).toThrow("already defined column");
  });

  it("raises with pk-specific message for primary key columns", () => {
    const td = new TableDefinition("t");
    expect(() => td.column("id", "integer", { primaryKey: true })).toThrow(
      "redefine the primary key",
    );
  });
});

describe("TableDefinition#primary_key option", () => {
  it("treats primaryKey: false same as id: false", () => {
    const td = new TableDefinition("t", { primaryKey: false });
    expect(td.columns.find((c) => c.options.primaryKey)).toBeUndefined();
  });

  it("treats primaryKey: 'uuid' as a custom PK column name", () => {
    const td = new TableDefinition("t", { primaryKey: "uuid" });
    const pk = td.columns.find((c) => c.options.primaryKey);
    expect(pk?.name).toBe("uuid");
  });
});

describe("TableDefinition#integer_like_primary_key?", () => {
  it("newColumnDefinition preserves integer pk type in base class", () => {
    const td = new TableDefinition("t", { id: false });
    const col = td.newColumnDefinition("id", "integer", { primaryKey: true });
    expect(col.type).toBe("integer");
  });
});

describe("TableDefinition#aliased_types", () => {
  it("maps timestamp to datetime", () => {
    const td = new TableDefinition("t", { id: false });
    td.column("ts", "timestamp");
    expect(td.columns[0].type).toBe("datetime");
  });
});

describe("Table#raise_on_if_exist_options", () => {
  const fakeSchema: any = {
    addColumn: async () => {},
    removeColumn: async () => {},
    renameColumn: async () => {},
    addIndex: async () => {},
    removeIndex: async () => {},
    addReference: async () => {},
    removeReference: async () => {},
    addTimestamps: async () => {},
    removeTimestamps: async () => {},
    addForeignKey: async () => {},
    removeForeignKey: async () => {},
    changeColumn: async () => {},
  };

  it("raises via column() when ifExists is passed", async () => {
    const t = new Table("users", fakeSchema);
    await expect(t.column("name", "string", { ifExists: true } as any)).rejects.toThrow(
      "if_exists",
    );
  });

  it("raises via index() when ifNotExists is passed", async () => {
    const t = new Table("users", fakeSchema);
    await expect(t.index("name", { ifNotExists: true } as any)).rejects.toThrow("if_not_exists");
  });

  it("raises via timestamps() when ifExists is passed", async () => {
    const t = new Table("users", fakeSchema);
    await expect(t.timestamps({ ifExists: true } as any)).rejects.toThrow("if_exists");
  });

  it("raises via references() when ifNotExists is passed", async () => {
    const t = new Table("users", fakeSchema);
    await expect(t.references("user", { ifNotExists: true })).rejects.toThrow("if_not_exists");
  });

  it("raises via string() type helper when ifExists is passed", async () => {
    const t = new Table("users", fakeSchema);
    await expect(t.string("name", { ifExists: true })).rejects.toThrow("if_exists");
  });
});

describe("Table#aliasedTypes", () => {
  const fakeSchema2 = {
    addColumn: async () => {},
    removeColumn: async () => {},
    changeColumn: async () => {},
    renameColumn: async () => {},
    addIndex: async () => {},
    removeIndex: async () => {},
    addReference: async () => {},
    addTimestamps: async () => {},
    renameIndex: async () => {},
  };

  it('maps "timestamp" to "datetime"', () => {
    const t = new Table("users", fakeSchema2 as any);
    expect(t.aliasedTypes("timestamp", "timestamp")).toBe("datetime");
  });

  it("returns fallback for unrecognised type names", () => {
    const t = new Table("users", fakeSchema2 as any);
    expect(t.aliasedTypes("string", "string")).toBe("string");
    expect(t.aliasedTypes("datetime", "datetime")).toBe("datetime");
  });
});

describe("TableDefinition id hash form", () => {
  const mysqlAdapter = {
    quoteIdentifier: (s: string) => `\`${s}\``,
    quoteTableName: (s: string) => `\`${s}\``,
    quoteDefaultExpression: (_v: unknown) => "",
  };

  it("extracts type and merges remaining keys as pk column options", () => {
    const td = new TableDefinition("t", {
      id: { type: "string", collation: "utf8mb4_bin" },
      adapterName: "mysql",
      adapter: mysqlAdapter,
    });
    const id = td.columns.find((c) => c.name === "id")!;
    expect(id.type).toBe("string");
    expect(id.options.collation).toBe("utf8mb4_bin");
    expect(id.options.primaryKey).toBe(true);
  });

  it("defaults type to primary_key when hash omits type", () => {
    const td = new TableDefinition("t", {
      id: { collation: "utf8mb4_bin" },
      adapterName: "mysql",
      adapter: mysqlAdapter,
    });
    const id = td.columns.find((c) => c.name === "id")!;
    expect(id.type).toBe("primary_key");
    expect(id.options.collation).toBe("utf8mb4_bin");
  });

  it("outer default is merged first, hash content overrides", () => {
    const td = new TableDefinition("t", {
      id: { type: "string", default: "generated" },
      default: "outer",
      adapterName: "mysql",
      adapter: mysqlAdapter,
    });
    const id = td.columns.find((c) => c.name === "id")!;
    expect(id.options.default).toBe("generated");
  });

  it("emits CHARACTER SET and COLLATE per-column in toSql for mysql", () => {
    const td = new TableDefinition("charset_collations", {
      id: { type: "string", collation: "utf8mb4_bin" },
      adapterName: "mysql",
      adapter: mysqlAdapter,
    });
    (td as any).string("string_ascii_bin", { charset: "ascii", collation: "ascii_bin" });
    const sql = td.toSql();
    expect(sql).toContain("CHARACTER SET ascii COLLATE ascii_bin");
    expect(sql).toContain("COLLATE utf8mb4_bin");
  });
});
