import { describe, it, expect, vi } from "vitest";
import {
  SchemaStatements,
  canRemoveIndexByName,
  indexNameForRemoveFrom,
} from "./schema-statements.js";
import { ForeignKeyDefinition, TableDefinition, type ColumnType } from "./schema-definitions.js";
import { AbstractAdapter } from "../abstract-adapter.js";
import { NotImplementedError } from "../../errors.js";

function makeStatements(adapterOverrides: Record<string, unknown> = {}) {
  return new SchemaStatements({
    adapterName: "sqlite" as const,
    quoteIdentifier: (n: string) => `"${n}"`,
    quoteTableName: (n: string) => `"${n}"`,
    quoteDefaultExpression: (v: unknown) => `${v}`,
    execute: vi.fn().mockResolvedValue([]),
    executeMutation: vi.fn().mockResolvedValue(undefined),
    // Every real host is an AbstractAdapter, which mixes in Quoting's
    // lookup_cast_type; the stub carries the base implementation so
    // fetchTypeMetadata dispatches through it as schema_statements.rb:1718 does.
    lookupCastType: (sqlType: string | null) => AbstractAdapter.TYPE_MAP.lookup(sqlType),
    config: {},
    ...adapterOverrides,
  } as any);
}

describe("SchemaStatements privates (PR 8)", () => {
  it("generateIndexName short", () => {
    const ss = makeStatements();
    expect(ss.generateIndexName("users", "email")).toBe("index_users_on_email");
  });

  it("generateIndexName long falls back to hash", () => {
    const ss = makeStatements();
    const name = ss.generateIndexName("users", "a".repeat(60));
    expect(name.length).toBeLessThanOrEqual(62);
    expect(name).toMatch(/_[0-9a-f]{10}$/);
  });

  it("indexName routes a column through generate_index_name by default", () => {
    const ss = makeStatements();
    expect(ss.indexName("users", { column: "email" })).toBe("index_users_on_email");
    expect(ss.indexName("users", { column: ["foo", "bar"] })).toBe("index_users_on_foo_and_bar");
  });

  it("indexName applies the generate_index_name length/hash fallback by default", () => {
    const ss = makeStatements();
    const expected = ss.generateIndexName("users", "a".repeat(60));
    expect(ss.indexName("users", { column: "a".repeat(60) })).toBe(expected);
    expect(ss.indexName("users", { column: "a".repeat(60) }).length).toBeLessThanOrEqual(62);
  });

  it("indexName uses the bare _and_ form when _usesLegacyIndexName is set", () => {
    const ss = makeStatements();
    expect(ss.indexName("users", { column: "a".repeat(60), _usesLegacyIndexName: true })).toBe(
      `index_users_on_${"a".repeat(60)}`,
    );
  });

  it("indexName returns options.name when no column is given", () => {
    const ss = makeStatements();
    expect(ss.indexName("users", { name: "custom_idx" })).toBe("custom_idx");
  });

  it("indexName raises when neither column nor name is given", () => {
    const ss = makeStatements();
    expect(() => ss.indexName("users", {})).toThrow("You must specify the index name");
  });

  it("validateChangeColumnNullArgumentBang accepts booleans", () => {
    const ss = makeStatements();
    expect(() => ss.validateChangeColumnNullArgumentBang(true)).not.toThrow();
    expect(() => ss.validateChangeColumnNullArgumentBang("yes")).toThrow(/boolean/);
  });

  it("columnOptionsKeys includes limit, null, default", () => {
    const ss = makeStatements();
    expect(ss.columnOptionsKeys()).toEqual(expect.arrayContaining(["limit", "null", "default"]));
  });

  it("optionsForIndexColumns with hash", () => {
    const ss = makeStatements();
    expect(ss.optionsForIndexColumns({ email: "asc" })("email")).toBe("asc");
    expect(ss.optionsForIndexColumns("desc")("anything")).toBe("desc");
  });

  it("isExpressionColumnName", () => {
    const ss = makeStatements();
    expect(ss.isExpressionColumnName("lower(email)")).toBe(true);
    expect(ss.isExpressionColumnName("email")).toBe(false);
  });

  it("indexColumnNames wraps string in array", () => {
    const ss = makeStatements();
    expect(ss.indexColumnNames("email")).toEqual(["email"]);
    expect(ss.indexColumnNames(["a", "b"])).toEqual(["a", "b"]);
  });

  it("indexNameOptions for expression joins words", () => {
    const ss = makeStatements();
    expect(ss.indexNameOptions("lower(email)")).toEqual({ column: "lower_email" });
    expect(ss.indexNameOptions("email")).toEqual({ column: "email" });
  });

  it("indexNameForRemove resolves a positional expression via generate_index_name", async () => {
    // Rails: `options[:name] = index_name(table, column_name)` — the expression
    // is scanned for \w+ words, joined with "_", and passed through
    // generate_index_name, yielding `index_users_on_lower_email`.
    const ss = makeStatements({
      indexes: vi
        .fn()
        .mockResolvedValue([
          { name: "index_users_on_lower_email", columns: ["email"], unique: false },
        ]),
    });
    expect(await ss.indexNameForRemove("users", "lower(email)", {})).toBe(
      "index_users_on_lower_email",
    );
  });

  it("indexNameForRemove applies the generate_index_name length/hash fallback to a long expression", async () => {
    const longExpr = `lower(${"a".repeat(80)})`;
    const expected = makeStatements().generateIndexName("users", `lower_${"a".repeat(80)}`);
    expect(expected).toMatch(/_[0-9a-f]{10}$/); // fallback fired
    const ss = makeStatements({
      indexes: vi.fn().mockResolvedValue([{ name: expected, columns: ["x"], unique: false }]),
    });
    expect(await ss.indexNameForRemove("users", longExpr, {})).toBe(expected);
  });

  it("stripTableNamePrefixAndSuffix strips prefix/suffix", () => {
    const ss = makeStatements({ tableNamePrefix: "app_", tableNameSuffix: "_v2" });
    expect(ss.stripTableNamePrefixAndSuffix("app_users_v2")).toBe("users");
    expect(makeStatements().stripTableNamePrefixAndSuffix("users")).toBe("users");
  });

  it("foreignKeyColumnFor strips table_name_prefix/suffix before singularizing", () => {
    const ss = makeStatements({ tableNamePrefix: "app_", tableNameSuffix: "_v2" });
    // Rails foreign_key_column_for strips prefix/suffix, so the prefixed
    // to_table `app_rockets_v2` yields `rocket_id`, not `app_rocket_v2_id`.
    expect(ss.foreignKeyColumnFor("app_rockets_v2")).toBe("rocket_id");
    expect(ss.foreignKeyColumnFor("app_rockets_v2", "uuid")).toBe("rocket_uuid");
    expect(makeStatements().foreignKeyColumnFor("rockets")).toBe("rocket_id");
  });

  it("foreignKeyName generates hash name", () => {
    const ss = makeStatements();
    expect(ss.foreignKeyName("users", { name: "my_fk", column: "org_id" })).toBe("my_fk");
    expect(ss.foreignKeyName("users", { column: "org_id" })).toMatch(/^fk_rails_[0-9a-f]{10}$/);
  });

  it("extractForeignKeyAction maps all specifiers", () => {
    const ss = makeStatements();
    expect(ss.extractForeignKeyAction("CASCADE")).toBe("cascade");
    expect(ss.extractForeignKeyAction("SET NULL")).toBe("nullify");
    expect(ss.extractForeignKeyAction("RESTRICT")).toBe("restrict");
    expect(ss.extractForeignKeyAction("NO ACTION")).toBeUndefined();
  });

  it("isForeignKeysEnabled reads config.foreignKeys", () => {
    expect(makeStatements().isForeignKeysEnabled()).toBe(true);
    expect(makeStatements({ _config: { foreignKeys: false } }).isForeignKeysEnabled()).toBe(false);
  });

  it("checkConstraintName", () => {
    const ss = makeStatements();
    expect(ss.checkConstraintName("users", { name: "my_chk" })).toBe("my_chk");
    expect(ss.checkConstraintName("users", { expression: "age > 0" })).toMatch(
      /^chk_rails_[0-9a-f]{10}$/,
    );
    expect(() => ss.checkConstraintName("users", {})).toThrow(/expression/);
  });

  it("checkConstraintOptions", () => {
    const ss = makeStatements();
    expect(ss.checkConstraintOptions("users", "age > 0", {})).toEqual({
      name: ss.checkConstraintName("users", { expression: "age > 0" }),
    });
    expect(
      ss.checkConstraintOptions("users", "age > 0", { name: "my_chk", validate: false }),
    ).toEqual({ name: "my_chk", validate: false });
    const options = {};
    ss.checkConstraintOptions("users", "age > 0", options);
    expect(options).toEqual({});
  });

  it("addCheckConstraint routes its options through checkConstraintOptions", async () => {
    const ss = makeStatements();
    const spy = vi.spyOn(ss, "checkConstraintOptions");
    await ss.addCheckConstraint("users", "age > 0", { name: "my_chk" });
    expect(spy).toHaveBeenCalledWith("users", "age > 0", { name: "my_chk" });
  });

  it("addCheckConstraint skips the DDL when ifNotExists and the constraint exists", async () => {
    const ss = makeStatements();
    const name = ss.checkConstraintName("users", { expression: "age > 0" });
    vi.spyOn(ss, "checkConstraints").mockResolvedValue([
      { tableName: "users", expression: "age > 0", name, validate: true } as any,
    ]);
    await ss.addCheckConstraint("users", "age > 0", { ifNotExists: true });
    expect((ss as any).adapter.execute).not.toHaveBeenCalled();

    await ss.addCheckConstraint("users", "age > 0", {});
    expect((ss as any).adapter.execute).toHaveBeenCalled();
  });

  // PR 8b helpers
  it("validateIndexLengthBang throws when name too long", () => {
    const ss = makeStatements();
    expect(() => ss.validateIndexLengthBang("users", "a".repeat(65))).toThrow(/too long/);
    expect(() => ss.validateIndexLengthBang("users", "a".repeat(64))).not.toThrow();
  });

  it("validateTableLengthBang throws when name too long", () => {
    const ss = makeStatements();
    expect(() => ss.validateTableLengthBang("a".repeat(65))).toThrow(/too long/);
    expect(() => ss.validateTableLengthBang("a".repeat(64))).not.toThrow();
  });

  it("extractNewDefaultValue unwraps {from,to} hash", () => {
    const ss = makeStatements();
    expect(ss.extractNewDefaultValue({ from: 0, to: 42 })).toBe(42);
    expect(ss.extractNewDefaultValue({ to: 42 })).toEqual({ to: 42 });
    expect(ss.extractNewDefaultValue(99)).toBe(99);
    expect(ss.extractNewDefaultValue(null)).toBeNull();
  });

  it("canRemoveIndexByName", () => {
    const ss = makeStatements();
    expect(ss.canRemoveIndexByName(null, { name: "idx" })).toBe(true);
    expect(ss.canRemoveIndexByName("email", { name: "idx" })).toBe(false);
    expect(ss.canRemoveIndexByName(null, { name: "idx", algorithm: "concurrently" })).toBe(true);
    expect(ss.canRemoveIndexByName(null, { name: "idx", unique: true })).toBe(false);
  });

  it("referenceNameForTable singularizes", () => {
    const ss = makeStatements();
    expect(ss.referenceNameForTable("users")).toBe("user");
    expect(ss.referenceNameForTable("public.users")).toBe("user");
  });

  it("renameColumnSql produces RENAME COLUMN fragment", () => {
    const ss = makeStatements();
    expect(ss.renameColumnSql("users", "name", "full_name")).toBe(
      `RENAME COLUMN "name" TO "full_name"`,
    );
  });

  it("removeColumnForAlter produces DROP COLUMN fragment", () => {
    const ss = makeStatements();
    expect(ss.removeColumnForAlter("users", "email")).toBe(`DROP COLUMN "email"`);
  });

  it("removeColumnsForAlter produces multiple DROP COLUMN fragments", () => {
    const ss = makeStatements();
    expect(ss.removeColumnsForAlter("users", ["a", "b"])).toEqual([
      `DROP COLUMN "a"`,
      `DROP COLUMN "b"`,
    ]);
  });

  it("removeTimestampsForAlter removes updated_at then created_at", () => {
    const ss = makeStatements();
    const frags = ss.removeTimestampsForAlter("users");
    expect(frags).toEqual([`DROP COLUMN "updated_at"`, `DROP COLUMN "created_at"`]);
  });

  // Mirrors change_column_default_for_alter (schema_statements.rb:1843): the
  // abstract helper only routes builder → schema_creation.accept; the SQL
  // shapes live in the PG/MySQL visitors (visit_ChangeColumnDefaultDefinition).
  it("changeColumnDefaultForAlter routes the built definition through schema_creation.accept", async () => {
    const ss = makeStatements();
    const cd = { marker: true };
    vi.spyOn(ss, "buildChangeColumnDefaultDefinition").mockResolvedValue(cd as never);
    vi.spyOn(ss, "schemaCreation", "get").mockReturnValue({
      accept: async (o: unknown) => (o === cd ? "ACCEPTED" : "WRONG"),
    } as never);
    expect(await ss.changeColumnDefaultForAlter("users", "status", "active")).toBe("ACCEPTED");
  });

  it("changeColumnDefaultForAlter raises NotImplementedError without an adapter builder", async () => {
    // Rails: the abstract build_change_column_default_definition raises
    // (schema_statements.rb:738-739); only PG/MySQL override it.
    const ss = makeStatements();
    await expect(ss.changeColumnDefaultForAlter("users", "status", null)).rejects.toThrow(
      "build_change_column_default_definition is not implemented",
    );
  });

  it("joinTableName derives name via Rails regex", () => {
    const ss = makeStatements();
    expect(ss.joinTableName("assemblies", "parts")).toBe("assemblies_parts");
    expect(ss.joinTableName("music_artists", "music_records")).toBe("music_artists_records");
    expect(ss.joinTableName("cats", "dogs")).toBe("cats_dogs");
  });

  it("findJoinTableName respects tableName option", () => {
    const ss = makeStatements();
    expect(ss.findJoinTableName("a", "b", { tableName: "overridden" })).toBe("overridden");
    expect(ss.findJoinTableName("cats", "dogs")).toBe("cats_dogs");
  });

  it("addTimestampsForAlter produces ADD fragments with precision when adapter supports it", async () => {
    const ss = makeStatements({ supportsDatetimeWithPrecision: () => true });
    const frags = await ss.addTimestampsForAlter("users");
    expect(frags).toHaveLength(2);
    expect(frags[0]).toContain("datetime(6)");
    expect(frags[1]).toContain("datetime(6)");
  });

  it("addTimestampsForAlter respects explicit null option", async () => {
    const ss = makeStatements();
    const frags = await ss.addTimestampsForAlter("users", { null: true });
    expect(frags[0]).not.toContain("NOT NULL");
  });

  it("joinTableName with schema-qualified names passes through dot (Rails-faithful)", () => {
    // Rails derive_join_table_name does not strip schema qualifiers; neither do we.
    // The [_.] in the regex covers '.' so common schema prefixes are still deduped.
    const ss = makeStatements();
    expect(ss.joinTableName("public.users", "public.roles")).toBe("public.roles_users");
    expect(ss.joinTableName("public.users", "posts")).toBe("posts_public.users");
  });

  it("createTableDefinition returns TableDefinition", () => {
    expect(makeStatements().createTableDefinition("orders").tableName).toBe("orders");
  });

  it("createAlterTable returns AlterTable", () => {
    expect(makeStatements().createAlterTable("orders").name).toBe("orders");
  });

  it("fetchTypeMetadata returns SqlTypeMetadata with sqlType", () => {
    const meta = makeStatements().fetchTypeMetadata("varchar(255)");
    expect(meta.sqlType).toBe("varchar(255)");
    // `Type#type` is a method, so the metadata must carry its result, not the
    // function object (schema_statements.rb:1721 `cast_type.type`).
    expect(meta.type).toBe("string");
    expect(meta.limit).toBe(255);
  });

  it("fetchTypeMetadata keeps a nil sql_type nil", () => {
    const meta = makeStatements().fetchTypeMetadata(null);
    expect(meta.sqlType).toBeNull();
    expect(meta.type).toBeUndefined();
  });

  it("foreignKeyFor returns undefined when not found", async () => {
    const ss = makeStatements();
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([]);
    expect(await ss.foreignKeyFor("users", { toTable: "orgs" })).toBeUndefined();
  });

  it("foreignKeyExists matches by toTable, column, and name", async () => {
    const ss = makeStatements();
    const fk = new ForeignKeyDefinition("users", "orgs", "org_id", "id", "fk_rails_abc");
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([fk]);

    expect(await ss.foreignKeyExists("users", "orgs")).toBe(true);
    expect(await ss.foreignKeyExists("users", "teams")).toBe(false);
    expect(await ss.foreignKeyExists("users", { column: "org_id" })).toBe(true);
    expect(await ss.foreignKeyExists("users", { column: "other_id" })).toBe(false);
    expect(await ss.foreignKeyExists("users", { name: "fk_rails_abc" })).toBe(true);
    expect(await ss.foreignKeyExists("users", { name: "nope" })).toBe(false);
    expect(await ss.foreignKeyExists("users")).toBe(true);
  });

  it("foreignKeyExists matches a composite column by value, not reference", async () => {
    const ss = makeStatements();
    const fk = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      ["rocket_tenant_id", "rocket_id"],
      ["tenant_id", "id"],
      "fk_rails_composite",
    );
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([fk]);

    // A distinct array instance with the same elements must still match.
    expect(
      await ss.foreignKeyExists("astronauts", "rockets", {
        column: ["rocket_tenant_id", "rocket_id"],
      }),
    ).toBe(true);
    expect(
      await ss.foreignKeyExists("astronauts", "rockets", {
        column: ["rocket_id", "rocket_tenant_id"],
      }),
    ).toBe(false);
  });

  it("addForeignKey with ifNotExists is a no-op when a composite FK already exists", async () => {
    const ss = makeStatements();
    const fk = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      ["rocket_tenant_id", "rocket_id"],
      ["tenant_id", "id"],
      "fk_rails_composite",
    );
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([fk]);
    const executeMutation = (ss as any).adapter.executeMutation as ReturnType<typeof vi.fn>;
    executeMutation.mockClear();

    await ss.addForeignKey("astronauts", "rockets", {
      column: ["rocket_tenant_id", "rocket_id"],
      primaryKey: ["tenant_id", "id"],
      ifNotExists: true,
    });

    // The composite column matches by value, so no ALTER TABLE is issued.
    expect(executeMutation).not.toHaveBeenCalled();
  });

  it("foreignKeyForBang throws when not found", async () => {
    const ss = makeStatements();
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([]);
    await expect(ss.foreignKeyForBang("users", { toTable: "orgs" })).rejects.toThrow(
      /foreign key/i,
    );
  });

  it("checkConstraintForBang throws when not found", async () => {
    const ss = makeStatements();
    vi.spyOn(ss, "checkConstraints").mockResolvedValue([]);
    await expect(ss.checkConstraintForBang("users", { expression: "age > 0" })).rejects.toThrow(
      /check constraint/i,
    );
  });
});

describe("SchemaStatements#quotedColumnsForIndex", () => {
  it("quotes column names without options", () => {
    const ss = makeStatements();
    expect(ss.quotedColumnsForIndex(["id", "name"])).toBe('"id", "name"');
  });

  it("appends sort order when adapter supports it and order option is given", () => {
    const ss = makeStatements({
      supportsIndexSortOrder: () => true,
    });
    expect(ss.quotedColumnsForIndex(["id", "name"], { order: { id: "desc", name: "asc" } })).toBe(
      '"id" DESC, "name" ASC',
    );
  });

  it("ignores sort order when adapter does not support it", () => {
    const ss = makeStatements({
      supportsIndexSortOrder: () => false,
    });
    expect(ss.quotedColumnsForIndex(["id", "name"], { order: { id: "desc" } })).toBe(
      '"id", "name"',
    );
  });
});

describe("canRemoveIndexByName (module-level)", () => {
  it("is true for a bare name", () => {
    expect(canRemoveIndexByName(null, { name: "idx" })).toBe(true);
  });

  it("tolerates an algorithm key", () => {
    expect(canRemoveIndexByName(null, { name: "idx", algorithm: "concurrently" })).toBe(true);
  });

  it("rejects extra keys other than name/algorithm", () => {
    expect(canRemoveIndexByName(null, { name: "idx", unique: true })).toBe(false);
  });

  it("rejects a given column name", () => {
    expect(canRemoveIndexByName("email", { name: "idx" })).toBe(false);
  });
});

describe("indexNameForRemoveFrom early return", () => {
  const genName = (t: string, c: string | string[]) =>
    `index_${t}_on_${Array.isArray(c) ? c.join("_and_") : c}`;

  it("returns options.name without introspection for a bare name", () => {
    expect(indexNameForRemoveFrom(genName, [], "users", undefined, { name: "idx" })).toBe("idx");
  });

  it("returns options.name when an algorithm key is present", () => {
    expect(
      indexNameForRemoveFrom(genName, [], "users", undefined, {
        name: "idx",
        algorithm: "concurrently",
      } as any),
    ).toBe("idx");
  });

  it("does not early-return when an extra key forces introspection", () => {
    const all = [{ name: "idx", columns: ["email"] }];
    expect(
      indexNameForRemoveFrom(genName, all, "users", undefined, {
        name: "idx",
        unique: true,
      } as any),
    ).toBe("idx");
    expect(() =>
      indexNameForRemoveFrom(genName, [], "users", undefined, { name: "idx", unique: true } as any),
    ).toThrow();
  });
});

describe("distinctRelationForPrimaryKey", () => {
  function makeRelation(over: Record<string, unknown> = {}) {
    const calls = { reselect: [] as unknown[], where: [] as Record<string, unknown>[] };
    const rel: any = {
      _calls: calls,
      primaryKey: "id",
      table: { name: "posts" },
      orderValues: [],
      _limitValue: 5,
      _offsetValue: 2,
      reselect(...cols: unknown[]) {
        calls.reselect = cols;
        // Rails reselect spawns a clone; return a distinct object so a stray
        // distinctBang on the original would be observable.
        return { ...this, distinctBang: () => {}, arel: this.arel };
      },
      arel: () => ({ toSql: () => "SELECT DISTINCT ..." }),
      // Rails uses where! (in-place); mirror that with whereBang.
      whereBang(c: Record<string, unknown>) {
        calls.where.push(c);
        return this;
      },
      limitBang(v: unknown) {
        this._limitValue = v;
      },
      offsetBang(v: unknown) {
        this._offsetValue = v;
      },
      ...over,
    };
    return rel;
  }

  it("reselects the table-qualified pk and materializes ids via selectRows", async () => {
    const selectRows = vi.fn().mockResolvedValue([[10], [20]]);
    const ss = makeStatements({ quoteColumnName: (n: string) => `"${n}"`, selectRows });
    const rel = makeRelation();

    const result = await ss.distinctRelationForPrimaryKey(rel);

    expect(rel._calls.reselect).toEqual(['"posts"."id"']);
    expect(selectRows).toHaveBeenCalledWith("SELECT DISTINCT ...", "SQL");
    expect(rel._calls.where).toEqual([{ id: [10, 20] }]);
    expect(rel._limitValue).toBeNull();
    expect(rel._offsetValue).toBeNull();
    expect(result).toBe(rel);
  });

  it("keeps only the trailing pk value when columns_for_distinct prepends order columns", async () => {
    // PG/MySQL prepend `order AS alias_n` columns; Rails takes results.last(pk.length).
    const selectRows = vi.fn().mockResolvedValue([
      ["2026-01-01", 10],
      ["2026-01-02", 20],
    ]);
    const ss = makeStatements({ quoteColumnName: (n: string) => `"${n}"`, selectRows });
    const rel = makeRelation();

    await ss.distinctRelationForPrimaryKey(rel);

    expect(rel._calls.where).toEqual([{ id: [10, 20] }]);
  });

  it("calls noneBang when no ids materialize", async () => {
    const noneBang = vi.fn();
    const whereBang = vi.fn();
    const ss = makeStatements({
      quoteColumnName: (n: string) => `"${n}"`,
      selectRows: vi.fn().mockResolvedValue([]),
    });
    const rel = makeRelation({ noneBang, whereBang });

    await ss.distinctRelationForPrimaryKey(rel);

    expect(noneBang).toHaveBeenCalledTimes(1);
    expect(whereBang).not.toHaveBeenCalled();
  });
});

describe("tableExists NotImplementedError fallback", () => {
  it("returns false for a blank table name without querying", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const ss = makeStatements({ quote: (v: string) => `'${v}'`, execute });

    expect(await ss.tableExists("")).toBe(false);
    expect(await ss.tableExists("   ")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("falls back to tables.include? when the data-source path is not implemented", async () => {
    const ss = makeStatements({ adapterName: "fake" as any, quote: (v: string) => `'${v}'` });
    vi.spyOn(ss, "tables").mockResolvedValue(["posts", "comments"]);

    expect(await ss.tableExists("posts")).toBe(true);
    expect(await ss.tableExists("widgets")).toBe(false);
  });

  it("propagates errors other than NotImplementedError", async () => {
    const ss = makeStatements({
      quote: (v: string) => `'${v}'`,
      execute: vi.fn().mockRejectedValue(new Error("connection lost")),
    });

    await expect(ss.tableExists("posts")).rejects.toThrow("connection lost");
  });
});

describe("dataSourceExists NotImplementedError fallback", () => {
  it("returns false for a blank data source name without querying", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const ss = makeStatements({
      execute,
      dataSourceSql: (n: string) => `SELECT 1 WHERE name = '${n}'`,
    });

    expect(await ss.dataSourceExists("")).toBe(false);
    expect(await ss.dataSourceExists("   ")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("issues one untyped data_source_sql query for tables and views alike", async () => {
    const execute = vi.fn().mockResolvedValue([{ one: 1 }]);
    const dataSourceSql = vi.fn((n: string) => `SELECT 1 WHERE name = '${n}'`);
    const ss = makeStatements({ execute, dataSourceSql });

    expect(await ss.dataSourceExists("posts")).toBe(true);
    expect(dataSourceSql).toHaveBeenCalledTimes(1);
    expect(dataSourceSql).toHaveBeenCalledWith("posts");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("falls back to data_sources.include? when the data-source path is not implemented", async () => {
    const ss = makeStatements({
      dataSourceSql: () => {
        throw new NotImplementedError("#data_source_sql is not implemented");
      },
    });
    vi.spyOn(ss, "dataSources").mockResolvedValue(["posts", "comments"]);

    expect(await ss.dataSourceExists("posts")).toBe(true);
    expect(await ss.dataSourceExists("widgets")).toBe(false);
  });

  it("propagates errors other than NotImplementedError", async () => {
    const ss = makeStatements({
      dataSourceSql: (n: string) => `SELECT 1 WHERE name = '${n}'`,
      execute: vi.fn().mockRejectedValue(new Error("connection lost")),
    });

    await expect(ss.dataSourceExists("posts")).rejects.toThrow("connection lost");
  });
});

describe("buildCreateTableDefinition routing", () => {
  function pkColumn(td: TableDefinition) {
    return td.columns.find((c) => c.options.primaryKey);
  }

  it("carries valid_primary_key_options through to the primary key column", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("users", {
      id: "integer",
      limit: 8,
      default: 0,
      precision: 3,
    });

    expect(pkColumn(td)?.options).toMatchObject({ limit: 8, default: 0, precision: 3 });
  });

  it("carries valid_table_definition_options through to the table definition", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("users", {
      temporary: true,
      ifNotExists: true,
      as: undefined,
      comment: "a table",
      options: "ENGINE=InnoDB",
    });

    expect(td.temporary).toBe(true);
    expect(td.ifNotExists).toBe(true);
    expect(td.comment).toBe("a table");
    expect(td.options).toBe("ENGINE=InnoDB");
  });

  it("expands the hash form of id onto the primary key column", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("users", {
      id: { type: "string", limit: 36, collation: "utf8mb4_bin" },
    });

    const pk = pkColumn(td);
    expect(pk?.type).toBe("string");
    expect(pk?.options).toMatchObject({ limit: 36, collation: "utf8mb4_bin" });
  });

  it("names the primary key column from the primaryKey option", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("users", { id: "uuid", primaryKey: "guid" });

    expect(pkColumn(td)?.name).toBe("guid");
    expect(pkColumn(td)?.type).toBe("uuid");
  });

  it("records a composite primaryKey array instead of a primary key column", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("orders", { primaryKey: ["shopId", "id"] });

    expect(td.compositePrimaryKey).toEqual(["shopId", "id"]);
    expect(pkColumn(td)).toBeUndefined();
  });

  it("builds the definition through the adapter's createTableDefinition", () => {
    const marker = Symbol("dialect-td");
    const createTableDefinition = vi.fn((name: string, options: Record<string, unknown>) => {
      const td: any = new TableDefinition(name, options as any);
      td[marker] = true;
      return td;
    });
    const ss = makeStatements({ createTableDefinition });

    const td = ss.buildCreateTableDefinition("users", { id: "bigint" });

    expect(createTableDefinition).toHaveBeenCalledTimes(1);
    expect((td as any)[marker]).toBe(true);
    expect(pkColumn(td)?.type).toBe("bigint");
  });

  it("is the path createTable takes to build its definition", async () => {
    const ss = makeStatements();
    const spy = vi.spyOn(ss, "buildCreateTableDefinition");

    // No teardown: `makeStatements` has a mocked `execute`, so no table is ever created.
    // eslint-disable-next-line blazetrails/require-table-teardown
    await ss.createTable("users", { id: "bigint", primaryKey: "guid", limit: 8 }, (t) => {
      t.column("name", "string");
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const td = spy.mock.results[0].value as TableDefinition;
    expect(pkColumn(td)?.name).toBe("guid");
    expect(pkColumn(td)?.options).toMatchObject({ limit: 8 });
  });
});

describe("buildCreateTableDefinition primaryKey: false", () => {
  it("still builds the conventional primary key column", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("users", { primaryKey: false });

    const pk = td.columns.find((c) => c.options.primaryKey);
    expect(pk?.name).toBe("id");
    expect(pk?.type).toBe("primary_key");
  });

  it("emits no primary key column when id is false", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("users", { id: false, primaryKey: false });

    expect(td.columns.find((c) => c.options.primaryKey)).toBeUndefined();
  });
});

describe("buildCreateTableDefinition hash-form id type fetch", () => {
  it("passes an explicitly supplied falsy type through instead of defaulting", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("users", {
      id: { type: "" as unknown as ColumnType, limit: 4 },
    });

    const pk = td.columns.find((c) => c.options.primaryKey);
    expect(pk?.type).toBe("");
    expect(pk?.options).toMatchObject({ limit: 4 });
  });

  it("defaults to primary_key only when the type key is absent", () => {
    const ss = makeStatements();

    const td = ss.buildCreateTableDefinition("users", { id: { limit: 4 } });

    expect(td.columns.find((c) => c.options.primaryKey)?.type).toBe("primary_key");
  });
});

describe("assumeMigratedUptoVersion", () => {
  function makeStatementsWithMigrations(migrations: number[], migrated: number[] = []) {
    const execute = vi.fn().mockResolvedValue([]);
    const ss = makeStatements({
      execute,
      quote: (v: unknown) => String(v),
      pool: {
        schemaMigration: { tableName: "schema_migrations" },
        migrationContext: {
          getAllVersions: async () => migrated,
          migrations: migrations.map((version) => ({ version })),
        },
      },
    });
    return { ss, execute };
  }

  it("inserts the target version and every earlier known migration", async () => {
    const { ss, execute } = makeStatementsWithMigrations([1, 2, 20], [1]);

    await ss.assumeMigratedUptoVersion(10);

    expect(execute.mock.calls.map((c) => c[0])).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (10)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2);',
    ]);
  });

  it("coerces a non-numeric version to 0 rather than raising", async () => {
    const { ss, execute } = makeStatementsWithMigrations([1, 2]);

    await ss.assumeMigratedUptoVersion("not_a_version");

    expect(execute.mock.calls.map((c) => c[0])).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (0)',
    ]);
  });

  it("strips digit-separating underscores like String#to_i", async () => {
    const { ss, execute } = makeStatementsWithMigrations([1, 2]);

    await ss.assumeMigratedUptoVersion("1_000");

    expect(execute.mock.calls.map((c) => c[0])).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (1000)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2),\n(1);',
    ]);
  });

  it("takes the leading integer prefix of a partially numeric version", async () => {
    const { ss, execute } = makeStatementsWithMigrations([1, 2, 20]);

    await ss.assumeMigratedUptoVersion("10abc");

    expect(execute.mock.calls.map((c) => c[0])).toEqual([
      'INSERT INTO "schema_migrations" (version) VALUES (10)',
      'INSERT INTO "schema_migrations" (version) VALUES\n(2),\n(1);',
    ]);
  });
});
