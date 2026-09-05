import { describe, it, expect, beforeAll } from "vitest";
import { SchemaCreation } from "./schema-creation.js";
import {
  CreateIndexDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  TableDefinition,
} from "./schema-definitions.js";
import { Base } from "../../base.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { currentAdapter } from "../../support/adapter-helper.js";
import { describeIfPostgresqlAdapter } from "../../support/describe-if-postgresql-adapter.js";
import type { TableDefinitionConn } from "./schema-definitions.js";
import type { SchemaCreationConn } from "./schema-creation.js";

let conn: TableDefinitionConn & SchemaCreationConn;

beforeAll(async () => {
  conn = (await Base.leaseConnection()) as unknown as TableDefinitionConn & SchemaCreationConn;
});

describe("SchemaCreation#typeToSql virtual / nil pass-through", () => {
  it("returns '' for a nil type (Rails type_to_sql: type.to_s of nil)", () => {
    expect(conn.typeToSql(undefined as any)).toBe("");
  });

  it("passes 'virtual' through verbatim, with no options.type/string fallback", () => {
    expect(conn.typeToSql("virtual" as any, { type: "integer" } as any)).toBe("virtual");
  });
});

describeIfPostgresqlAdapter("SchemaCreation drop-constraint visitors", () => {
  it("visit_DropForeignKey emits DROP CONSTRAINT with a quoted name", () => {
    const sc = new SchemaCreation(conn) as any;
    expect(sc.visitDropForeignKey("fk_rails_abc")).toBe('DROP CONSTRAINT "fk_rails_abc"');
  });

  it("visit_DropCheckConstraint emits DROP CONSTRAINT with a quoted name", async () => {
    const sc = new SchemaCreation(conn) as any;
    expect(await sc.visitDropCheckConstraint("chk_rails_abc")).toBe(
      'DROP CONSTRAINT "chk_rails_abc"',
    );
  });
});

describeIfSqlite("SchemaCreation#visit_TableDefinition inline indexes", () => {
  class IndexesInCreate extends SchemaCreation {
    protected override supportsIndexesInCreate(): boolean {
      return true;
    }

    protected async indexInCreate(
      tableName: string,
      columnName: string | string[],
    ): Promise<string> {
      return `INDEX index_${tableName}_on_${String(columnName)} (${String(columnName)})`;
    }
  }

  it("emits index_in_create for each index when supports_indexes_in_create? is true", async () => {
    const td = new TableDefinition(conn, "users");
    td.string("email");
    td.index("email");

    const sql = await new IndexesInCreate(conn).accept(td);
    expect(sql).toContain("INDEX index_users_on_email (email)");
  });

  it("emits no inline index when supports_indexes_in_create? is false", async () => {
    const td = new TableDefinition(conn, "users");
    td.string("email");
    td.index("email");

    const sql = await new SchemaCreation(conn).accept(td);
    expect(sql).not.toContain("INDEX");
  });
});

describe("SchemaCreation support predicates", () => {
  it("supports_indexes_in_create? is true only on MySQL", () => {
    expect((new SchemaCreation(conn) as any).supportsIndexesInCreate()).toBe(
      currentAdapter("Mysql2Adapter"),
    );
  });

  it("supports_exclusion_constraints? is true only on PostgreSQL", () => {
    expect((new SchemaCreation(conn) as any).supportsExclusionConstraints()).toBe(
      currentAdapter("PostgreSQLAdapter"),
    );
  });

  it("supports_unique_constraints? is true only on PostgreSQL", () => {
    expect((new SchemaCreation(conn) as any).supportsUniqueConstraints()).toBe(
      currentAdapter("PostgreSQLAdapter"),
    );
  });
});

describeIfPostgresqlAdapter("SchemaCreation quoting delegations", () => {
  it("quote_column_name / quote_table_name delegate to the quoter", () => {
    const sc = new SchemaCreation(conn) as any;
    expect(sc.quoteColumnName("title")).toBe('"title"');
    expect(sc.quoteTableName("posts")).toBe('"posts"');
  });
});

describeIfPostgresqlAdapter("SchemaCreation#quotedColumnsForIndex sub-part length gating", () => {
  it("does not append sub-part length on postgres", async () => {
    const idx = new IndexDefinition("posts", "index_posts_on_title", false, ["title"], {
      lengths: { title: 10 },
    });
    const sql = await (new SchemaCreation(conn) as any).visitCreateIndexDefinition(
      new CreateIndexDefinition(idx),
    );
    expect(sql).not.toContain("(10)");
    expect(sql).toContain('("title")');
  });
});

describeIfSqlite("SchemaCreation#quotedColumnsForIndex sub-part length gating", () => {
  it("does not append sub-part length on sqlite", async () => {
    const idx = new IndexDefinition("posts", "index_posts_on_title", false, ["title"], {
      lengths: { title: 10 },
    });
    const sql = await (new SchemaCreation(conn) as any).visitCreateIndexDefinition(
      new CreateIndexDefinition(idx),
    );
    expect(sql).not.toContain("(10)");
    expect(sql).toContain('("title")');
  });
});

describe("SchemaCreation#quotedColumns delegates to the connection", () => {
  const host = {
    quoteColumnName: (c: string) => `"${c}"`,
    quoteTableName: (t: string) => `"${t}"`,
    quoteDefaultExpression: (v: unknown) => String(v),
    supportsIndexUsing: () => false,
    supportsIndexInclude: async () => false,
    supportsNullsNotDistinct: async () => false,
    supportsPartialIndex: () => false,
    quotedColumnsForIndex(cols: string[], options: any) {
      const opc = (c: string) =>
        typeof options.opclass === "string" ? options.opclass : options.opclass?.[c];
      return cols.map((c) => `"${c}" ${opc(c) ?? "DEFAULT_OPS"}`).join(", ");
    },
  };

  it("routes an array column set through host.quotedColumnsForIndex", async () => {
    const idx = new IndexDefinition("posts", "index_posts_on_title", false, ["title"], {
      opclasses: { title: "text_pattern_ops" },
    });
    const sql = await (new SchemaCreation(host as any) as any).visitCreateIndexDefinition(
      new CreateIndexDefinition(idx),
    );
    expect(sql).toContain('("title" text_pattern_ops)');
  });

  it("emits a String column set verbatim without delegating", async () => {
    const idx = new IndexDefinition(
      "posts",
      "index_posts_on_expr",
      false,
      "lower(title)" as any,
      {},
    );
    const sql = await (new SchemaCreation(host as any) as any).visitCreateIndexDefinition(
      new CreateIndexDefinition(idx),
    );
    expect(sql).toContain("(lower(title))");
    expect(sql).not.toContain("DEFAULT_OPS");
  });
});

describe("SchemaCreation#typeToSql decimal precision/scale", () => {
  it("raises when a decimal scale is given without a precision", () => {
    expect(() => conn.typeToSql("decimal", { scale: 2 })).toThrow(
      "Error adding decimal column: precision cannot be empty if scale is specified",
    );
  });

  it("honors precision and scale when both are given", () => {
    expect(
      conn.typeToSql("decimal", {
        precision: 8,
        scale: 2,
      }),
    ).toBe("decimal(8,2)");
  });

  it("emits a bare decimal with no precision when none is given", () => {
    expect(conn.typeToSql("decimal")).toBe("decimal");
  });
});

describeIfSqlite("SchemaCreation#visit_ForeignKeyDefinition nil column lists", () => {
  it("renders empty column lists for a nil column and primary key (Ruby Array())", () => {
    const sc = new SchemaCreation(conn) as any;
    const fk = new ForeignKeyDefinition("astronauts", "rockets", {
      column: null as unknown as string,
      primaryKey: null as unknown as string,
      name: "fk_rails_abc",
    });
    expect(sc.visitForeignKeyDefinition(fk)).toBe(
      'CONSTRAINT "fk_rails_abc" FOREIGN KEY () REFERENCES "rockets" ("id")',
    );
  });
});
