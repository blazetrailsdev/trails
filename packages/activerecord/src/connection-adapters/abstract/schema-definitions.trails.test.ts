import { describe, it, expect, afterEach, beforeAll } from "vitest";
import {
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  ReferenceDefinition,
  IndexDefinition,
  TableDefinition,
  Table,
  type ReferenceDefinitionConnection,
} from "./schema-definitions.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Base } from "../../base.js";
import type { TableDefinitionConn } from "./schema-definitions.js";
import type { SchemaCreationConn } from "./schema-creation.js";

let conn: TableDefinitionConn & SchemaCreationConn;

beforeAll(async () => {
  conn = (await Base.leaseConnection()) as unknown as TableDefinitionConn & SchemaCreationConn;
});

const originalFkPattern = SchemaDumper.fkIgnorePattern;
const originalChkPattern = SchemaDumper.chkIgnorePattern;

afterEach(() => {
  SchemaDumper.fkIgnorePattern = originalFkPattern;
  SchemaDumper.chkIgnorePattern = originalChkPattern;
});

describe("ForeignKeyDefinition#export_name_on_schema_dump?", () => {
  const fk = (name: string): ForeignKeyDefinition =>
    new ForeignKeyDefinition("astronauts", "rockets", "rocket_id", "id", name);

  it("honors a custom SchemaDumper.fkIgnorePattern at call time", () => {
    expect(fk("ignored_fk_astronauts_rockets").isExportNameOnSchemaDump).toBe(true);
    expect(fk("fk_rails_0123456789").isExportNameOnSchemaDump).toBe(false);

    SchemaDumper.fkIgnorePattern = /^ignored_/;
    expect(fk("ignored_fk_astronauts_rockets").isExportNameOnSchemaDump).toBe(false);
    expect(fk("fk_rails_0123456789").isExportNameOnSchemaDump).toBe(true);
  });

  it("stays stable across repeated calls with a g-flagged pattern", () => {
    SchemaDumper.fkIgnorePattern = /^ignored_/g;
    const definition = fk("ignored_fk_astronauts_rockets");
    expect(definition.isExportNameOnSchemaDump).toBe(false);
    expect(definition.isExportNameOnSchemaDump).toBe(false);
  });
});

describe("CheckConstraintDefinition#export_name_on_schema_dump?", () => {
  const chk = (name: string): CheckConstraintDefinition =>
    new CheckConstraintDefinition("trades", "price > 0", { name });

  it("honors a custom SchemaDumper.chkIgnorePattern at call time", () => {
    expect(chk("ignored_chk_trades_price").isExportNameOnSchemaDump).toBe(true);
    expect(chk("chk_rails_0123456789").isExportNameOnSchemaDump).toBe(false);

    SchemaDumper.chkIgnorePattern = /^ignored_/;
    expect(chk("ignored_chk_trades_price").isExportNameOnSchemaDump).toBe(false);
    expect(chk("chk_rails_0123456789").isExportNameOnSchemaDump).toBe(true);
  });
});

describe("CheckConstraintDefinition#validate?", () => {
  it("returns the stored value when :validate is present, including nil", () => {
    expect(new CheckConstraintDefinition("t", "e", {}).validate).toBe(true);
    expect(new CheckConstraintDefinition("t", "e", { validate: false }).validate).toBe(false);
    expect(new CheckConstraintDefinition("t", "e", { validate: null }).validate).toBe(null);
  });

  it("ignores a validate lookup when the definition stores no :validate", () => {
    const definition = new CheckConstraintDefinition("t", "e", { name: "chk" });

    expect(definition.isDefinedFor({ name: "chk", validate: false })).toBe(true);
    expect(definition.isDefinedFor({ name: "chk", validate: true })).toBe(true);
    expect(
      new CheckConstraintDefinition("t", "e", { name: "chk", validate: false }).isDefinedFor({
        name: "chk",
        validate: true,
      }),
    ).toBe(false);
  });
});

describe("CheckConstraintDefinition#defined_for?", () => {
  it("compares the residual options with to_s, sliced to the stored keys", () => {
    const definition = new CheckConstraintDefinition("t", "e", {
      name: "chk",
      validate: true,
      comment: "priced",
    });

    expect(definition.isDefinedFor({ name: "chk", comment: "priced" })).toBe(true);
    expect(definition.isDefinedFor({ name: "chk", comment: "other" })).toBe(false);
    expect(definition.isDefinedFor({ name: "chk", ifExists: true })).toBe(true);
  });
});

describe("TableDefinition#remove_column", () => {
  const td = (): TableDefinition => {
    const t = new TableDefinition(conn, "astronauts");
    t.setPrimaryKey("astronauts", true);
    t.string("name");
    t.integer("rocket_id");
    return t;
  };

  it("drops the named column and leaves the rest in order", () => {
    const t = td();
    t.removeColumn("name");
    expect(t.columns.map((c) => c.name)).toEqual(["id", "rocket_id"]);
  });

  it("is a no-op for a column that was never defined", () => {
    const t = td();
    t.removeColumn("nonexistent");
    expect(t.columns.map((c) => c.name)).toEqual(["id", "name", "rocket_id"]);
  });
});

describe("ReferenceDefinition#add", () => {
  type Call = [string, ...unknown[]];

  const recorder = (): { calls: Call[]; connection: ReferenceDefinitionConnection } => {
    const calls: Call[] = [];
    return {
      calls,
      connection: {
        async addColumn(tableName, columnName, type, options) {
          calls.push(["addColumn", tableName, columnName, type, options]);
        },
        async addIndex(tableName, columns, options) {
          calls.push(["addIndex", tableName, columns, options]);
        },
        async addForeignKey(fromTable, toTable, options) {
          calls.push(["addForeignKey", fromTable, toTable, options]);
        },
      },
    };
  };

  it("adds the column, index and foreign key in Rails' order", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("user", { foreignKey: true }).add("taggings", connection);

    expect(calls.map((c) => c[0])).toEqual(["addColumn", "addIndex", "addForeignKey"]);
    expect(calls[0].slice(1, 4)).toEqual(["taggings", "user_id", "bigint"]);
    expect(calls[1][2]).toEqual(["user_id"]);
    expect(calls[2][2]).toBe("users");
    expect(calls[2][3]).toMatchObject({ column: "user_id" });
  });

  it("adds a polymorphic reference type-column first and names its index", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("taggable", { polymorphic: true }).add("taggings", connection);

    expect(calls.map((c) => c[2])).toEqual([
      "taggable_type",
      "taggable_id",
      ["taggable_type", "taggable_id"],
    ]);
    expect(calls[2][3]).toMatchObject({ name: "index_taggings_on_taggable" });
  });

  it("forwards first/after positioning onto the polymorphic type column", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("taggable", { polymorphic: true, after: "id" }).add(
      "taggings",
      connection,
    );

    expect(calls[0][4]).toMatchObject({ after: "id" });
    expect(calls[1][4]).toMatchObject({ after: "id" });

    const first = recorder();
    await new ReferenceDefinition("taggable", { polymorphic: true, first: true }).add(
      "taggings",
      first.connection,
    );

    expect(first.calls[0][4]).toMatchObject({ first: true });
    expect(first.calls[1][4]).toMatchObject({ first: true });
  });

  it("merges an index options hash", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("user", { index: { unique: true, name: "my_index" } }).add(
      "taggings",
      connection,
    );

    expect(calls[1][3]).toMatchObject({ unique: true, name: "my_index" });
  });

  it("passes ifNotExists through to the index and foreign key options", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("user", { foreignKey: true, ifNotExists: true }).add(
      "taggings",
      connection,
    );

    expect(calls[1][3]).toMatchObject({ ifNotExists: true });
    expect(calls[2][3]).toMatchObject({ ifNotExists: true });
  });

  it("merges a polymorphic options hash into the type column", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("taggable", {
      polymorphic: { null: false },
      index: false,
    }).add("taggings", connection);

    expect(calls[0][2]).toBe("taggable_type");
    expect(calls[0][4]).toMatchObject({ null: false });
  });

  it("skips the index when index is false", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("user", { index: false }).add("taggings", connection);

    expect(calls.map((c) => c[0])).toEqual(["addColumn"]);
  });
});

describe("ReferenceDefinition#foreign_table_name", () => {
  const originalPluralize = Base.pluralizeTableNames;

  afterEach(() => {
    Base.pluralizeTableNames = originalPluralize;
  });

  it("targets the singular table when Base.pluralizeTableNames is false", () => {
    Base.pluralizeTableNames = false;
    const ref = new ReferenceDefinition("user", { foreignKey: true, index: false });
    const td = new TableDefinition(conn, "posts");
    ref.addTo(td);
    expect(td.foreignKeys[0].toTable).toBe("user");
  });

  it("still honors an explicit toTable when pluralizeTableNames is false", () => {
    Base.pluralizeTableNames = false;
    const ref = new ReferenceDefinition("author", {
      foreignKey: { toTable: "accounts" },
      index: false,
    });
    const td = new TableDefinition(conn, "posts");
    ref.addTo(td);
    expect(td.foreignKeys[0].toTable).toBe("accounts");
  });
});

describe("TableDefinition column methods", () => {
  it("defines one column per name, mirroring `names.each` in define_column_methods", () => {
    const td = new TableDefinition(conn, "posts");
    td.string("goat", "sheep", { limit: 40 });

    expect(td.columns.map((c) => c.name)).toEqual(["goat", "sheep"]);
    expect(td.columns.map((c) => c.options.limit)).toEqual([40, 40]);
  });

  it("defines a single column when no options are passed", () => {
    const td = new TableDefinition(conn, "posts");
    td.integer("votes");

    expect(td.columns.map((c) => c.name)).toEqual(["votes"]);
  });

  it("raises when called with no column name", () => {
    const td = new TableDefinition(conn, "posts");

    expect(() => (td.timestamp as () => unknown)()).toThrow("Missing column name(s) for timestamp");
    expect(() => (td.string as (o: object) => unknown)({ limit: 40 })).toThrow(
      "Missing column name(s) for string",
    );
  });
});

describe("ColumnMethods#primary_key", () => {
  it("merges primary_key: true and honours the type argument on create_table", () => {
    const td = new TableDefinition(conn, "posts");
    td.primaryKey("id", "uuid", { default: "gen_random_uuid()" });

    expect(td.columns.map((c) => c.name)).toEqual(["id"]);
    expect(td.columns[0].type).toBe("uuid");
    expect(td.columns[0].options.primaryKey).toBe(true);
    expect(td.columns[0].options.default).toBe("gen_random_uuid()");
  });

  it("defaults the type to primary_key", () => {
    const td = new TableDefinition(conn, "posts");
    td.primaryKey("id");

    expect(td.columns[0].type).toBe("primary_key");
    expect(td.columns[0].options.primaryKey).toBe(true);
  });
});

describe("IndexDefinition concise options", () => {
  it("leaves an already-collapsed scalar alone", () => {
    const index = new IndexDefinition("posts", "index_posts_on_abc", false, ["a", "b", "c"], {
      orders: "desc",
      opclasses: "aaa",
      lengths: 10,
    });

    expect(index.orders).toBe("desc");
    expect(index.opclasses).toBe("aaa");
    expect(index.lengths).toBe(10);
  });
});

describe("TableDefinition#create_column_definition", () => {
  const td = () => new TableDefinition(conn, "articles");

  it("raises on a column option outside valid_column_definition_options", () => {
    expect(() => td().column("title", "string", { preccision: true } as never)).toThrow(
      "Unknown key: :preccision. Valid keys are: :limit, :precision, :scale, :default, :null, :collation, :comment, :primaryKey, :ifExists, :ifNotExists",
    );
  });

  it("skips the check when _skipValidateOptions is set", () => {
    expect(() =>
      td().column("title", "string", { preccision: true, _skipValidateOptions: true } as never),
    ).not.toThrow();
  });

  it("excepts _usesLegacyReferenceIndexName from the checked keys", () => {
    expect(() =>
      td().column("title", "string", { _usesLegacyReferenceIndexName: true } as never),
    ).not.toThrow();
  });
});

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
    expect(idx.isDefinedFor(undefined, { column: "a" })).toBe(true);
    expect(idx.isDefinedFor(undefined, { column: "b" })).toBe(false);
  });

  it('treats blank positional columns ([] and "") as absent, like Ruby blank?', () => {
    const idx = new IndexDefinition("t", "i", false, ["a"]);
    expect(idx.isDefinedFor([], { column: "a" })).toBe(true);
    expect(idx.isDefinedFor("", { column: "a" })).toBe(true);
    expect(idx.isDefinedFor([], { column: "b" })).toBe(false);
  });

  it("matches a Symbol, a String or an Array include: against the stored column names", () => {
    const idx = new IndexDefinition("t", "i", false, ["a"], { include: ["b", "c"] });
    expect(idx.isDefinedFor(["a"], { include: ["b", "c"] })).toBe(true);
    expect(idx.isDefinedFor(["a"], { include: ["b"] })).toBe(false);

    const single = new IndexDefinition("t", "i", false, ["a"], { include: ["b"] });
    expect(single.isDefinedFor(["a"], { include: ":b" })).toBe(true);
    expect(single.isDefinedFor(["a"], { include: "b" })).toBe(true);
    expect(single.isDefinedFor(["a"], { include: ":c" })).toBe(false);
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
    expect(noActions.isDefinedFor({ onDelete: "cascade" })).toBe(false);
  });

  it("ignores a validate lookup when the definition did not store :validate", () => {
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
    const fkDef = new TableDefinition(conn, "astronauts").newForeignKeyDefinition("rockets");
    expect(fkDef.isDefinedFor({ primaryKey: "wrong" })).toBe(true);
    expect(fkDef.isDefinedFor({ onDelete: "cascade" })).toBe(true);
    expect(fkDef.isDefinedFor({ onUpdate: "cascade" })).toBe(true);
    expect(fkDef.isDefinedFor({ deferrable: "deferred" })).toBe(true);
    expect(fkDef.isDefinedFor({ column: "rocket_id" })).toBe(true);
    expect(fkDef.isDefinedFor({ column: "wrong_id" })).toBe(false);
    const withPk = new TableDefinition(conn, "astronauts").newForeignKeyDefinition("rockets", {
      primaryKey: "uuid",
    });
    expect(withPk.isDefinedFor({ primaryKey: "uuid" })).toBe(true);
    expect(withPk.isDefinedFor({ primaryKey: "wrong" })).toBe(false);
  });

  it("respects adapter-specific stored option keys (mysql lacks deferrable, sqlite lacks name)", () => {
    const mysqlFk = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      "rocket_id",
      "id",
      "fk_rails_abc",
      undefined,
      undefined,
      undefined,
      undefined,
      ["column", "name", "primaryKey", "onDelete", "onUpdate"],
    );
    expect(mysqlFk.isDefinedFor({ deferrable: "deferred" })).toBe(true);
    expect(mysqlFk.isDefinedFor({ name: "wrong" })).toBe(false);
    const sqliteFk = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      "rocket_id",
      "id",
      "fk_synth_name",
      undefined,
      undefined,
      undefined,
      undefined,
      ["column", "primaryKey", "onDelete", "onUpdate", "deferrable"],
    );
    expect(sqliteFk.isDefinedFor({ name: "anything" })).toBe(true);
    expect(sqliteFk.isDefinedFor({ column: "wrong" })).toBe(false);
  });
});

describe("TableDefinition#new_foreign_key_definition", () => {
  it("defaults the name to fk_rails_<hex>, not fk_<table>_<column>", () => {
    const fk = new TableDefinition(conn, "astronauts").newForeignKeyDefinition("rockets");
    expect(fk.column).toBe("rocket_id");
    expect(fk.name).toMatch(/^fk_rails_[0-9a-f]{10}$/);
  });

  it("routes column/name defaults through the adapter's foreignKeyOptions", () => {
    const adapter = {
      foreignKeyOptions(fromTable: string, toTable: string, options: Record<string, unknown>) {
        return { ...options, column: "custom_id", name: `fk_${fromTable}_${toTable}` };
      },
    } as any;
    const td = new TableDefinition(adapter, "astronauts");
    const fk = td.newForeignKeyDefinition("rockets");
    expect(fk.column).toBe("custom_id");
    expect(fk.name).toBe("fk_astronauts_rockets");
  });

  it("maps a composite primaryKey array to a composite column array (bare-adapter fallback)", () => {
    const fk = new TableDefinition(conn, "astronauts").newForeignKeyDefinition("rockets", {
      primaryKey: ["tenant_id", "id"],
    });
    expect(fk.column).toEqual(["rocket_tenant_id", "rocket_id"]);
  });

  it("add_composite_foreign_key_raises_if_column_and_primary_key_sizes_mismatch", () => {
    expect(() =>
      new TableDefinition(conn, "astronauts").newForeignKeyDefinition("rockets", {
        column: "rocket_id",
        primaryKey: ["tenant_id", "id"],
      }),
    ).toThrow(":column must reference all the :primary_key columns");
  });

  it("applies table_name_prefix/suffix to to_table before building the def", () => {
    const adapter = {
      tableNamePrefix: "app_",
      tableNameSuffix: "_v2",
      foreignKeyOptions(_fromTable: string, toTable: string, options: Record<string, unknown>) {
        return { ...options, column: "rocket_id", name: "fk_rails_deadbeef00", toTable };
      },
    } as any;
    const td = new TableDefinition(adapter, "app_astronauts_v2");
    const fk = td.newForeignKeyDefinition("rockets");
    expect(fk.toTable).toBe("app_rockets_v2");
  });
});

describe("TableDefinition#new_check_constraint_definition", () => {
  it("defaults the name to chk_rails_<hex> (bare-adapter fallback)", () => {
    const chk = new TableDefinition(conn, "products").newCheckConstraintDefinition("price > 0");
    expect(chk.name).toMatch(/^chk_rails_[0-9a-f]{10}$/);
    expect(chk.validate).toBe(true);
  });

  it("routes the options hash through the adapter's checkConstraintOptions", () => {
    const calls: unknown[][] = [];
    const adapter = {
      checkConstraintOptions(
        tableName: string,
        expression: string,
        options: Record<string, unknown>,
      ) {
        calls.push([tableName, expression, options]);
        return { ...options, name: `chk_${tableName}` };
      },
    } as any;
    const td = new TableDefinition(adapter, "products");
    const chk = td.newCheckConstraintDefinition("price > 0", { validate: false });
    expect(calls).toEqual([["products", "price > 0", { validate: false }]]);
    expect(chk.name).toBe("chk_products");
    expect(chk.validate).toBe(false);
  });

  it("check_constraint routes through new_check_constraint_definition", () => {
    const adapter = {
      checkConstraintOptions(
        tableName: string,
        _expression: string,
        options: Record<string, unknown>,
      ) {
        return { ...options, name: `chk_${tableName}` };
      },
    } as any;
    const td = new TableDefinition(adapter, "products");
    td.checkConstraint("price > 0");
    expect(td.checkConstraints.map((c) => c.name)).toEqual(["chk_products"]);
  });
});

describe("ReferenceDefinition helpers", () => {
  it("addTo adds id column by default", () => {
    const ref = new ReferenceDefinition("user", { index: false });
    const td = new TableDefinition(conn, "posts");
    ref.addTo(td);
    expect(td.columns.map((c) => c.name)).toContain("user_id");
  });

  it("addTo adds type column when polymorphic", () => {
    const ref = new ReferenceDefinition("taggable", { polymorphic: true, index: false });
    const td = new TableDefinition(conn, "taggings");
    ref.addTo(td);
    const names = td.columns.map((c) => c.name);
    expect(names).toContain("taggable_id");
    expect(names).toContain("taggable_type");
  });

  it("addTo adds index with polymorphic name", () => {
    const ref = new ReferenceDefinition("taggable", { polymorphic: true });
    const td = new TableDefinition(conn, "taggings");
    ref.addTo(td);
    expect(td.indexes[0][1].name).toBe("index_taggings_on_taggable");
  });

  it("addTo adds foreign key when foreignKey: true", () => {
    const ref = new ReferenceDefinition("user", { foreignKey: true, index: false });
    const td = new TableDefinition(conn, "posts");
    ref.addTo(td);
    expect(td.foreignKeys).toHaveLength(1);
    expect(td.foreignKeys[0].toTable).toBe("users");
  });

  it("addTo respects toTable in foreignKey options", () => {
    const ref = new ReferenceDefinition("author", {
      foreignKey: { toTable: "accounts" },
      index: false,
    });
    const td = new TableDefinition(conn, "posts");
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
    const td = new TableDefinition(conn, "taggings");
    ref.addTo(td);
    expect(td.columns[0].name).toBe("taggable_type");
    expect(td.columns[1].name).toBe("taggable_id");
  });
});

describe("TableDefinition#raise_on_duplicate_column", () => {
  it("raises when adding a duplicate non-pk column", () => {
    const td = new TableDefinition(conn, "t");
    td.string("name");
    expect(() => td.string("name")).toThrow("already defined column");
  });

  it("raises with pk-specific message for primary key columns", () => {
    const td = new TableDefinition(conn, "t");
    td.setPrimaryKey("t", true);
    expect(() => td.column("id", "integer", { primaryKey: true })).toThrow(
      "redefine the primary key",
    );
  });
});

describe("TableDefinition#primary_key option", () => {
  it("treats primaryKey: 'uuid' as a custom PK column name", () => {
    const td = new TableDefinition(conn, "t");
    td.setPrimaryKey("t", true, "uuid");
    const pk = td.columns.find((c) => c.options.primaryKey);
    expect(pk?.name).toBe("uuid");
  });
});

describe("TableDefinition#integer_like_primary_key?", () => {
  it("newColumnDefinition preserves integer pk type in base class", () => {
    const td = new TableDefinition(conn, "t");
    const col = td.newColumnDefinition("id", "integer", { primaryKey: true });
    expect(col.type).toBe("integer");
  });
});

describe("TableDefinition#aliased_types", () => {
  it("maps timestamp to datetime", () => {
    const td = new TableDefinition(conn, "t");
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
  it("extracts type and merges remaining keys as pk column options", () => {
    const td = new TableDefinition(conn, "t");
    td.setPrimaryKey("t", { type: "string", collation: "utf8mb4_bin" });
    const id = td.columns.find((c) => c.name === "id")!;
    expect(id.type).toBe("string");
    expect(id.options.collation).toBe("utf8mb4_bin");
    expect(id.options.primaryKey).toBe(true);
  });

  it("defaults type to primary_key when hash omits type", () => {
    const td = new TableDefinition(conn, "t");
    td.setPrimaryKey("t", { collation: "utf8mb4_bin" });
    const id = td.columns.find((c) => c.name === "id")!;
    expect(id.type).toBe("primary_key");
    expect(id.options.collation).toBe("utf8mb4_bin");
  });

  it("outer default is merged first, hash content overrides", () => {
    const td = new TableDefinition(conn, "t");
    td.setPrimaryKey("t", { type: "string", default: "generated" }, undefined, {
      default: "outer",
    });
    const id = td.columns.find((c) => c.name === "id")!;
    expect(id.options.default).toBe("generated");
  });
});

describe("Table exists-predicate forwarders", () => {
  const calls: unknown[][] = [];
  const recordingSchema = {
    columnExists: async (...args: unknown[]) => {
      calls.push(["columnExists", ...args]);
      return true;
    },
    foreignKeyExists: async (...args: unknown[]) => {
      calls.push(["foreignKeyExists", ...args]);
      return true;
    },
  };

  it("columnExists forwards the type and the trailing options", async () => {
    calls.length = 0;
    const t = new Table("users", recordingSchema as never);
    await t.columnExists("name", "string", { limit: 80 });
    await t.columnExists("name", "string");
    await t.columnExists("name");
    expect(calls).toEqual([
      ["columnExists", "users", "name", "string", { limit: 80 }],
      ["columnExists", "users", "name", "string"],
      ["columnExists", "users", "name", undefined],
    ]);
  });

  it("foreignKeyExists forwards the to_table alongside the options", async () => {
    calls.length = 0;
    const t = new Table("users", recordingSchema as never);
    await t.foreignKeyExists("authors", { column: "author_id" });
    await t.foreignKeyExists("authors");
    await t.foreignKeyExists({ column: "author_id" });
    await t.foreignKeyExists();
    expect(calls).toEqual([
      ["foreignKeyExists", "users", "authors", { column: "author_id" }],
      ["foreignKeyExists", "users", "authors"],
      ["foreignKeyExists", "users", { column: "author_id" }],
      ["foreignKeyExists", "users"],
    ]);
  });
});
