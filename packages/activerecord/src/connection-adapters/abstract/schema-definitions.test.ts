import { describe, it, expect } from "vitest";
import {
  IndexDefinition,
  ForeignKeyDefinition,
  ReferenceDefinition,
  TableDefinition,
  Table,
} from "./schema-definitions.js";
import { SchemaCreation } from "./schema-creation.js";

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

describe("IndexDefinition#defined_for?", () => {
  it("falls back to the :column option when positional columns are absent", () => {
    const idx = new IndexDefinition("t", "i", false, ["a"]);
    // Mirrors Rails: `columns = options[:column] if columns.blank?`
    expect(idx.isDefinedFor(undefined, { column: "a" })).toBe(true);
    expect(idx.isDefinedFor(undefined, { column: "b" })).toBe(false);
  });

  it('treats blank positional columns ([] and "") as absent, like Ruby blank?', () => {
    const idx = new IndexDefinition("t", "i", false, ["a"]);
    expect(idx.isDefinedFor([], { column: "a" })).toBe(true);
    expect(idx.isDefinedFor("", { column: "a" })).toBe(true);
    expect(idx.isDefinedFor([], { column: "b" })).toBe(false);
  });
});

describe("ForeignKeyDefinition#defined_for?", () => {
  const fk = (): ForeignKeyDefinition =>
    new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      "rocket_id",
      "pk",
      "fk_rails_abc",
      "cascade",
      "restrict",
      "deferred",
    );

  it("matches to_table, column, name, and validate explicitly", () => {
    expect(fk().isDefinedFor({ toTable: "rockets" })).toBe(true);
    expect(fk().isDefinedFor({ toTable: "stars" })).toBe(false);
    expect(fk().isDefinedFor({ column: "rocket_id" })).toBe(true);
    expect(fk().isDefinedFor({ column: "wrong_id" })).toBe(false);
    expect(fk().isDefinedFor({ name: "fk_rails_abc" })).toBe(true);
    expect(fk().isDefinedFor({ name: "nope" })).toBe(false);
  });

  it("generically compares remaining option keys with to_s coercion", () => {
    // Mirrors defined_for?'s `options.all? { ... to_s == to_s }`.
    expect(fk().isDefinedFor({ primaryKey: "pk" })).toBe(true);
    expect(fk().isDefinedFor({ primaryKey: "id" })).toBe(false);
    expect(fk().isDefinedFor({ onDelete: "cascade" })).toBe(true);
    expect(fk().isDefinedFor({ onDelete: "nullify" })).toBe(false);
    expect(fk().isDefinedFor({ onUpdate: "restrict" })).toBe(true);
    expect(fk().isDefinedFor({ onUpdate: "cascade" })).toBe(false);
    expect(fk().isDefinedFor({ deferrable: "deferred" })).toBe(true);
    expect(fk().isDefinedFor({ deferrable: "immediate" })).toBe(false);
  });

  it("treats an unset stored option as Array(nil) => [], not a 'undefined' string", () => {
    const noActions = new ForeignKeyDefinition("astronauts", "rockets", "rocket_id", "id", "fk_x");
    expect(noActions.onDelete).toBeUndefined();
    // [] vs ["cascade"] => false, mirroring Array(nil).map(&:to_s) == ["cascade"]
    expect(noActions.isDefinedFor({ onDelete: "cascade" })).toBe(false);
  });

  it("ignores a validate lookup when the definition did not store :validate", () => {
    // mysql/sqlite introspection (and add/DSL paths that didn't pass validate)
    // leave :validate absent. Rails' `options.fetch(:validate, validate)` then
    // falls back to the lookup value, so any validate lookup matches.
    const noValidate = new ForeignKeyDefinition("astronauts", "rockets", "rocket_id", "id", "fk_x");
    expect(noValidate.storesValidate).toBe(false);
    expect(noValidate.isDefinedFor({ validate: false })).toBe(true);
    expect(noValidate.isDefinedFor({ validate: true })).toBe(true);
  });

  it("compares validate when the definition stored :validate (PG introspection)", () => {
    const stored = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      "rocket_id",
      "id",
      "fk_x",
      undefined,
      undefined,
      undefined,
      false,
    );
    expect(stored.storesValidate).toBe(true);
    expect(stored.isDefinedFor({ validate: false })).toBe(true);
    expect(stored.isDefinedFor({ validate: true })).toBe(false);
  });

  it("compares composite primary keys element-wise", () => {
    const composite = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      ["rocket_tenant_id", "rocket_id"],
      ["tenant_id", "id"],
      "fk_rails_xyz",
    );
    expect(composite.isDefinedFor({ primaryKey: ["tenant_id", "id"] })).toBe(true);
    expect(composite.isDefinedFor({ primaryKey: ["id", "tenant_id"] })).toBe(false);
    expect(composite.isDefinedFor({ primaryKey: "id" })).toBe(false);
  });

  it("slices out lookup keys the definition does not store", () => {
    // Mirrors `options = options.slice(*self.options.keys)`: a key the FK never
    // carried is dropped before the generic compare, so it is ignored.
    const fkDef = new TableDefinition("astronauts").newForeignKeyDefinition("rockets");
    // primaryKey/onDelete/onUpdate/deferrable were not passed, so they are not
    // stored — a lookup on them is sliced out and matches.
    expect(fkDef.isDefinedFor({ primaryKey: "wrong" })).toBe(true);
    expect(fkDef.isDefinedFor({ onDelete: "cascade" })).toBe(true);
    expect(fkDef.isDefinedFor({ onUpdate: "cascade" })).toBe(true);
    expect(fkDef.isDefinedFor({ deferrable: "deferred" })).toBe(true);
    // column and name are always stored (Rails foreign_key_options fills them),
    // so they still compare.
    expect(fkDef.isDefinedFor({ column: "rocket_id" })).toBe(true);
    expect(fkDef.isDefinedFor({ column: "wrong_id" })).toBe(false);
    // An explicitly-set key is stored and compared.
    const withPk = new TableDefinition("astronauts").newForeignKeyDefinition("rockets", {
      primaryKey: "uuid",
    });
    expect(withPk.isDefinedFor({ primaryKey: "uuid" })).toBe(true);
    expect(withPk.isDefinedFor({ primaryKey: "wrong" })).toBe(false);
  });

  it("respects adapter-specific stored option keys (mysql lacks deferrable, sqlite lacks name)", () => {
    // Rails' MySQL foreign_keys options hash has no :deferrable, so that key is
    // sliced out of the compare and matches regardless.
    const mysqlFk = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      "rocket_id",
      "id",
      "fk_rails_abc",
      undefined,
      undefined,
      undefined,
      // Rails' MySQL foreign_keys options hash has no :validate.
      undefined,
      ["column", "name", "primaryKey", "onDelete", "onUpdate"],
    );
    expect(mysqlFk.isDefinedFor({ deferrable: "deferred" })).toBe(true);
    expect(mysqlFk.isDefinedFor({ name: "wrong" })).toBe(false);
    // Rails' SQLite foreign_keys options hash has no :name (we synthesize one),
    // so a name lookup is sliced out and matches.
    const sqliteFk = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      "rocket_id",
      "id",
      "fk_synth_name",
      undefined,
      undefined,
      undefined,
      // Rails' SQLite foreign_keys options hash has no :validate.
      undefined,
      ["column", "primaryKey", "onDelete", "onUpdate", "deferrable"],
    );
    expect(sqliteFk.isDefinedFor({ name: "anything" })).toBe(true);
    expect(sqliteFk.isDefinedFor({ column: "wrong" })).toBe(false);
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
    expect(() => new SchemaCreation("sqlite").accept(td)).toThrow(
      /Column "bad" has an empty or blank type/,
    );
  });

  it("throws a descriptive error for a whitespace-only custom type", () => {
    const td = new TableDefinition("t", { id: false });
    td.column("bad", "   " as any);
    expect(() => new SchemaCreation("sqlite").accept(td)).toThrow(
      /Column "bad" has an empty or blank type/,
    );
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
});
