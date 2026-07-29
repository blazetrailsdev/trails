import { describe, it, expect } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import { CreateIndexDefinition, IndexDefinition } from "./schema-definitions.js";

describe("SchemaCreation#typeToSql blank type guard", () => {
  it("throws a descriptive error for an empty custom type", () => {
    expect(() => new SchemaCreation("sqlite").typeToSql("" as any)).toThrow(/empty or blank type/);
  });

  it("throws a descriptive error for a whitespace-only custom type", () => {
    expect(() => new SchemaCreation("sqlite").typeToSql("   " as any)).toThrow(
      /empty or blank type/,
    );
  });
});

describe("SchemaCreation#typeToSql virtual / nil pass-through", () => {
  it("returns '' for a nil type (Rails type_to_sql: type.to_s of nil)", () => {
    expect(new SchemaCreation("sqlite").typeToSql(undefined as any)).toBe("");
  });

  it("passes 'virtual' through verbatim, with no options.type/string fallback", () => {
    // Rails' type_to_sql has no :virtual case, so type_to_sql(:virtual) → "virtual".
    // The :virtual → options[:type] mapping is newColumnDefinition-only.
    expect(
      new SchemaCreation("sqlite").typeToSql("virtual" as any, { type: "integer" } as any),
    ).toBe("virtual");
  });
});

describe("SchemaCreation drop-constraint visitors", () => {
  it("visit_DropForeignKey emits DROP CONSTRAINT with a quoted name", () => {
    const sc = new SchemaCreation("postgres") as any;
    expect(sc.visitDropForeignKey("fk_rails_abc")).toBe('DROP CONSTRAINT "fk_rails_abc"');
  });

  it("visit_DropCheckConstraint emits DROP CONSTRAINT with a quoted name", () => {
    const sc = new SchemaCreation("postgres") as any;
    expect(sc.visitDropCheckConstraint("chk_rails_abc")).toBe('DROP CONSTRAINT "chk_rails_abc"');
  });
});

describe("SchemaCreation support predicates", () => {
  it("supports_indexes_in_create? is true only on MySQL", () => {
    expect((new SchemaCreation("mysql") as any).supportsIndexesInCreate()).toBe(true);
    expect((new SchemaCreation("postgres") as any).supportsIndexesInCreate()).toBe(false);
    expect((new SchemaCreation("sqlite") as any).supportsIndexesInCreate()).toBe(false);
  });

  it("supports_exclusion_constraints? is true only on PostgreSQL", () => {
    expect((new SchemaCreation("postgres") as any).supportsExclusionConstraints()).toBe(true);
    expect((new SchemaCreation("mysql") as any).supportsExclusionConstraints()).toBe(false);
  });

  it("supports_unique_constraints? is true only on PostgreSQL", () => {
    expect((new SchemaCreation("postgres") as any).supportsUniqueConstraints()).toBe(true);
    expect((new SchemaCreation("mysql") as any).supportsUniqueConstraints()).toBe(false);
  });
});

describe("SchemaCreation quoting delegations", () => {
  it("quote_column_name / quote_table_name delegate to the quoter", () => {
    const sc = new SchemaCreation("postgres") as any;
    expect(sc.quoteColumnName("title")).toBe('"title"');
    expect(sc.quoteTableName("posts")).toBe('"posts"');
  });
});

describe("SchemaCreation#quotedColumnsForIndex sub-part length gating", () => {
  // Sub-part index lengths (`col(N)`) are MySQL-only DDL. Rails applies them
  // exclusively in AbstractMysqlAdapter#add_index_length; the abstract visitor
  // must NOT, or it emits invalid `("name"(10))` on PG/SQLite.
  for (const adapter of ["postgres", "sqlite"] as const) {
    it(`does not append sub-part length on ${adapter}`, () => {
      const idx = new IndexDefinition("posts", "index_posts_on_title", false, ["title"], {
        lengths: { title: 10 },
      });
      const sql = (new SchemaCreation(adapter) as any).visitCreateIndexDefinition(
        new CreateIndexDefinition(idx, false),
      );
      expect(sql).not.toContain("(10)");
      expect(sql).toContain('("title")');
    });
  }
});

describe("SchemaCreation#quotedColumns delegates to the connection", () => {
  // Rails' abstract SchemaCreation delegates :quoted_columns_for_index to @conn
  // (schema_creation.rb:18). When a real adapter is threaded as the host, the
  // visitor must route column quoting through it rather than re-deriving the
  // order/opclass decoration inline — that's the single source of truth
  // (SchemaStatements#quoted_columns_for_index -> add_options_for_index_columns).
  const host = {
    quoteIdentifier: (c: string) => `"${c}"`,
    quoteTableName: (t: string) => `"${t}"`,
    quoteDefaultExpression: (v: unknown) => String(v),
    quotedColumnsForIndex(cols: string[], options: any) {
      // Stand-in for the connection's decoration, incl. PG opclass folding.
      // Mirrors options_for_index_columns: a String opclass applies to every
      // column, a Record keys per-column (IndexDefinition#conciseOptions
      // collapses a uniform Record to a String).
      const opc = (c: string) =>
        typeof options.opclass === "string" ? options.opclass : options.opclass?.[c];
      return cols.map((c) => `"${c}" ${opc(c) ?? "DEFAULT_OPS"}`).join(", ");
    },
  };

  it("routes an array column set through host.quotedColumnsForIndex", () => {
    const idx = new IndexDefinition("posts", "index_posts_on_title", false, ["title"], {
      opclasses: { title: "text_pattern_ops" },
    });
    const sql = (new SchemaCreation("postgres", host as any) as any).visitCreateIndexDefinition(
      new CreateIndexDefinition(idx, false),
    );
    expect(sql).toContain('("title" text_pattern_ops)');
  });

  it("emits a String column set verbatim without delegating", () => {
    const idx = new IndexDefinition(
      "posts",
      "index_posts_on_expr",
      false,
      "lower(title)" as any,
      {},
    );
    const sql = (new SchemaCreation("postgres", host as any) as any).visitCreateIndexDefinition(
      new CreateIndexDefinition(idx, false),
    );
    expect(sql).toContain("(lower(title))");
    expect(sql).not.toContain("DEFAULT_OPS");
  });
});

describe("SchemaCreation#typeToSql decimal precision/scale", () => {
  it("raises when a decimal scale is given without a precision", () => {
    expect(() => new SchemaCreation("sqlite").typeToSql("decimal", { scale: 2 })).toThrow(
      "Error adding decimal column: precision cannot be empty if scale is specified",
    );
  });

  it("honors precision and scale when both are given", () => {
    expect(new SchemaCreation("sqlite").typeToSql("decimal", { precision: 8, scale: 2 })).toBe(
      "decimal(8,2)",
    );
  });

  it("emits a bare decimal with no precision when none is given", () => {
    // Rails sources the default from native_database_types[:decimal], which
    // carries no :precision on SQLite/MySQL/PostgreSQL — so a precision-less
    // decimal dumps bare rather than defaulting to (10).
    expect(new SchemaCreation("sqlite").typeToSql("decimal")).toBe("decimal");
    expect(new SchemaCreation("mysql").typeToSql("decimal")).toBe("decimal");
    expect(new SchemaCreation("postgres").typeToSql("decimal")).toBe("decimal");
  });
});
