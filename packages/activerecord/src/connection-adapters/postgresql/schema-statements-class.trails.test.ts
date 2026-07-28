import { describe, expect, it, vi } from "vitest";
import { PostgreSQLSchemaStatements } from "./schema-statements-class.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";

interface FakeOptions {
  logger?: { warn: (msg: string) => void };
  schemaQuery?: (sql: string) => Promise<Record<string, unknown>[]>;
  queryValue?: (sql: string) => Promise<unknown>;
  maxIdentifierLength?: number;
}

function makeAdapter(options: FakeOptions = {}) {
  const sql: string[] = [];
  const adapter = {
    adapterName: "postgres" as const,
    logger: options.logger ?? null,
    quote: (v: unknown) => `'${String(v).replace(/'/g, "''")}'`,
    quoteColumnName: (n: string) => `"${n}"`,
    quoteLiteral: (v: unknown) => `'${String(v).replace(/'/g, "''")}'`,
    // The real adapter quotes each dot-separated part; the tests below rely on
    // a schema-qualified name surviving as `"a"."b"`.
    quoteTableName: (n: string) =>
      n
        .split(".")
        .map((part) => `"${part.replace(/^"|"$/g, "")}"`)
        .join("."),
    quotedScope(name?: string | null) {
      const [schema, table] = this.extractSchemaQualifiedName(name ?? "");
      return {
        schema: schema ? this.quote(schema) : "ANY (current_schemas(false))",
        name: table ? this.quote(table) : null,
        type: null,
      };
    },
    extractSchemaQualifiedName(name: string): [string | null, string] {
      const parts = name.split(".").map((p) => p.replace(/^"|"$/g, ""));
      return parts.length > 1 ? [parts[0], parts[1]] : [null, parts[0]];
    },
    schemaQuery: vi.fn(async (text: string) => {
      sql.push(text);
      return options.schemaQuery ? await options.schemaQuery(text) : [];
    }),
    queryValue: vi.fn(async (text: string) => {
      sql.push(text);
      return options.queryValue ? await options.queryValue(text) : null;
    }),
    getDatabaseVersion: vi.fn(async () => 160000),
    maxIdentifierLength: () => options.maxIdentifierLength ?? 63,
  };
  return { adapter: adapter as unknown as DatabaseAdapter, sql };
}

// Expected digests are the literals Rails asserts in
// migration/exclusion_constraint_test.rb and migration/unique_constraint_test.rb,
// so drift in the identifier shape or digest slice fails here rather than
// silently changing emitted DDL and dumped schema.
describe("PostgreSQLSchemaStatements constraint name digests", () => {
  it("derives the exclusion constraint name Rails derives", () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter().adapter);
    expect(
      ss.exclusionConstraintName("invoices", {
        expression: "daterange(start_date, end_date) WITH &&",
      }),
    ).toBe("excl_rails_74c9160f55");
  });

  it("derives the unique constraint name Rails derives from a column list", () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter().adapter);
    expect(ss.uniqueConstraintName("sections", { column: ["position"] })).toBe(
      "uniq_rails_1e07660b77",
    );
  });

  it("derives the unique constraint name Rails derives from usingIndex", () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter().adapter);
    expect(ss.uniqueConstraintName("sections", { usingIndex: "unique_index" })).toBe(
      "uniq_rails_79b901ffb4",
    );
  });

  it("returns an explicit :name option unchanged", () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter().adapter);
    expect(ss.exclusionConstraintName("invoices", { name: "my_excl", expression: "x" })).toBe(
      "my_excl",
    );
    expect(ss.uniqueConstraintName("sections", { name: "my_uniq", column: ["position"] })).toBe(
      "my_uniq",
    );
  });
});

describe("PostgreSQLSchemaStatements sequence helpers warn without a sequence", () => {
  it("setPkSequenceBang warns when the table has a primary key but no sequence", async () => {
    const warn = vi.fn();
    const ss = new PostgreSQLSchemaStatements(makeAdapter({ logger: { warn } }).adapter);
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await ss.setPkSequenceBang("postgresql_uuids", 42);
    expect(warn).toHaveBeenCalledWith(
      "postgresql_uuids has primary key id with no default sequence.",
    );
  });

  it("resetPkSequenceBang warns when the table has a primary key but no sequence", async () => {
    const warn = vi.fn();
    const ss = new PostgreSQLSchemaStatements(makeAdapter({ logger: { warn } }).adapter);
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await ss.resetPkSequenceBang("postgresql_uuids");
    expect(warn).toHaveBeenCalledWith(
      "postgresql_uuids has primary key id with no default sequence.",
    );
  });

  it("stays silent when no logger is configured", async () => {
    const ss = new PostgreSQLSchemaStatements(makeAdapter().adapter);
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await expect(ss.setPkSequenceBang("postgresql_uuids", 42)).resolves.toBeUndefined();
  });

  it("does not warn when the table has no primary key at all", async () => {
    const warn = vi.fn();
    const ss = new PostgreSQLSchemaStatements(makeAdapter({ logger: { warn } }).adapter);
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(null);
    await ss.setPkSequenceBang("postgresql_uuids", 42);
    expect(warn).not.toHaveBeenCalled();
  });
});

// Rails' index_name_exists? runs BOTH arguments through quoted_scope and
// compares `i.relname = index[:name]` (schema_statements.rb:67-81), so a
// schema-qualified index name matches on its bare identifier.
describe("PostgreSQLSchemaStatements#indexNameExists", () => {
  it("parses the index name through quotedScope rather than quoting it raw", async () => {
    const { adapter, sql } = makeAdapter({
      queryValue: async () => 1,
    });
    const ss = new PostgreSQLSchemaStatements(adapter);
    expect(await ss.indexNameExists("my_schema.things", "my_schema.index_a")).toBe(true);
    expect(sql[0]).toContain("i.relname = 'index_a'");
    expect(sql[0]).not.toContain("'my_schema.index_a'");
  });
});

describe("PostgreSQLSchemaStatements#pkAndSequenceFor", () => {
  // Rails' fallback query selects `nsp.nspname` — the TABLE's namespace — and a
  // CASE that strips everything through the dot, so the sequence's own schema
  // never survives (schema_statements.rb:382-407).
  it("pairs the table schema with the bare sequence name on the default_expr fallback", async () => {
    const { adapter } = makeAdapter({
      schemaQuery: async () => [
        {
          pk: "id",
          seq: null,
          default_expr: "nextval('other_schema.things_id_seq'::regclass)",
          schema_name: "public",
        },
      ],
    });
    const ss = new PostgreSQLSchemaStatements(adapter);
    expect(await ss.pkAndSequenceFor("things")).toEqual([
      "id",
      { schema: "public", name: "things_id_seq" },
    ]);
  });

  // Rails' bare `rescue nil` covers the whole method, not just unknown tables.
  it("returns null when the lookup raises", async () => {
    const { adapter } = makeAdapter({
      schemaQuery: async () => {
        throw new Error("boom");
      },
    });
    const ss = new PostgreSQLSchemaStatements(adapter);
    expect(await ss.pkAndSequenceFor("things")).toBeNull();
  });
});

describe("PostgreSQLSchemaStatements#resetPkSequenceBang", () => {
  // Ruby's `max_pk ? true : false` is a nil check; 0 is truthy in Ruby.
  it("emits setval(..., 0, true) when the max primary key is 0", async () => {
    const { adapter, sql } = makeAdapter({ queryValue: async () => 0 });
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.resetPkSequenceBang("things", "id", "public.things_id_seq");
    expect(sql.at(-1)).toContain(`SELECT setval('"public"."things_id_seq"', 0, true)`);
  });

  it("emits setval(..., minvalue, false) when the table is empty", async () => {
    const { adapter, sql } = makeAdapter({
      queryValue: async (text) => (text.includes("seqmin") ? 1 : null),
    });
    const ss = new PostgreSQLSchemaStatements(adapter);
    await ss.resetPkSequenceBang("things", "id", "public.things_id_seq");
    expect(sql.at(-1)).toContain(`SELECT setval('"public"."things_id_seq"', 1, false)`);
  });
});

// PostgreSQL's identifier limit is NAMEDATALEN - 1, and NAMEDATALEN is a
// compile-time constant: `max_identifier_length` is the real server value, not
// necessarily 63. sequenceNameFromParts is what newColumnFromField compares a
// column's nextval() default against to decide `serial:`, so a budget that
// ignores the server value mis-detects serial columns and changes the dump.
describe("PostgreSQLSchemaStatements sequenceNameFromParts identifier budget", () => {
  it("truncates against the server's maxIdentifierLength, not a hardcoded 63", () => {
    const { adapter } = makeAdapter({ maxIdentifierLength: 31 });
    const ss = new PostgreSQLSchemaStatements(adapter);
    const name = ss.sequenceNameFromParts("a".repeat(40), "b".repeat(10), "seq");
    expect(name).toBe(`${"a".repeat(16)}_${"b".repeat(10)}_seq`);
    expect(name.length).toBe(31);
  });

  it("splits the overage across column and table under a short limit", () => {
    const { adapter } = makeAdapter({ maxIdentifierLength: 31 });
    const ss = new PostgreSQLSchemaStatements(adapter);
    const name = ss.sequenceNameFromParts("a".repeat(40), "b".repeat(30), "seq");
    expect(name).toBe(`${"a".repeat(13)}_${"b".repeat(13)}_seq`);
    expect(name.length).toBe(31);
  });

  it("leaves names within the limit untouched", () => {
    const { adapter } = makeAdapter({ maxIdentifierLength: 31 });
    const ss = new PostgreSQLSchemaStatements(adapter);
    expect(ss.sequenceNameFromParts("things", "id", "seq")).toBe("things_id_seq");
  });
});
