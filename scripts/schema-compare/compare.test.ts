import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSchemaRb, parseSchemaRbWithCoverage } from "./parse-schema-rb.js";
import {
  applyBaseline,
  compareSchemas,
  isFatal,
  loadRailsTables,
  normalizeRailsDefault,
  optionMismatches,
  optionRegressions,
  partitionFindings,
  readBaseline,
  SCHEMA_FILES,
  TRANSCRIPTION_DIVERGENCE_ALLOW_LIST,
  compareTranscriptions,
  describeSpec,
  unresolvedCallSites,
} from "./compare.js";
import { canonicalRegistrySchema } from "../../packages/activerecord/src/support/canonical-schema.js";
import { TEST_SCHEMA } from "../../packages/activerecord/src/test-helpers/test-schema.js";
import type { Finding } from "./compare.js";
import type { ColumnSpec, Schema } from "../../packages/activerecord/src/support/schema-types.js";

const parse = (rb: string) => parseSchemaRb(`ActiveRecord::Schema.define do\n${rb}\nend\n`);
const columnsOfTable = (rb: string, table: string) => [...parse(rb).get(table)!.columns.keys()];
const verdicts = (findings: Finding[]) =>
  findings.map((f) => `${f.verdict}:${f.column ? `${f.table}.${f.column}` : f.table}`);

describe("parseSchemaRb", () => {
  it("parses plain column macros", () => {
    expect(
      columnsOfTable(
        `create_table :accounts, force: true do |t|
           t.string  :firm_name
           t.integer :credit_limit
         end`,
        "accounts",
      ),
    ).toEqual(["firm_name", "credit_limit"]);
  });

  it("parses quoted and symbol table names", () => {
    const tables = parse(
      `create_table :"1_need_quoting", force: true do |t|
         t.string :name
       end
       create_table "CamelCase", force: true do |t|
         t.string :name
       end`,
    );
    expect([...tables.keys()]).toEqual(["1_need_quoting", "CamelCase"]);
  });

  it("parses a block-less create_table", () => {
    const table = parse(`create_table :carriers, force: true`).get("carriers");
    expect(table?.columns.size).toBe(0);
  });

  it("expands t.references and polymorphic references", () => {
    expect(
      columnsOfTable(
        `create_table :attachments, force: true do |t|
           t.references :record, polymorphic: true, null: false
           t.belongs_to :person
         end`,
        "attachments",
      ),
    ).toEqual(["record_id", "record_type", "person_id"]);
  });

  it("expands t.timestamps into created_at and updated_at", () => {
    expect(
      columnsOfTable(
        `create_table :toys, force: true do |t|
           t.timestamps null: false
         end`,
        "toys",
      ),
    ).toEqual(["created_at", "updated_at"]);
  });

  it("parses t.column with an explicit type", () => {
    const table = parse(
      `create_table :audit_logs, force: true do |t|
         t.column :message, :string, null: false
       end`,
    ).get("audit_logs")!;
    expect(table.columns.get("message")).toMatchObject({
      type: "string",
      options: { null: false },
    });
  });

  it("declares multiple columns from one macro", () => {
    expect(
      columnsOfTable(
        `create_table :xs, force: true do |t|
           t.string :a, :b, limit: 10
         end`,
        "xs",
      ),
    ).toEqual(["a", "b"]);
  });

  it("records the implicit primary key and primary_key: overrides", () => {
    const tables = parse(
      `create_table :posts, force: true do |t|
         t.string :title
       end
       create_table :bulbs, primary_key: "ID", force: true do |t|
       end
       create_table :carts, force: true, primary_key: [:shop_id, :id] do |t|
       end
       create_table :auto_id_tests, force: true, id: false do |t|
       end`,
    );
    expect([...tables.get("posts")!.primaryKeyColumns]).toEqual(["id"]);
    expect([...tables.get("bulbs")!.primaryKeyColumns]).toEqual(["ID"]);
    expect([...tables.get("carts")!.primaryKeyColumns]).toEqual(["shop_id", "id"]);
    expect([...tables.get("auto_id_tests")!.primaryKeyColumns]).toEqual([]);
  });

  it("ignores t.index and does not treat a modifier-if as a nested block", () => {
    expect(
      columnsOfTable(
        `create_table :books, force: true do |t|
           t.string :name
           t.index "(lower(external_id))", unique: true if supports_expression_index?
           t.string :isbn
         end`,
        "books",
      ),
    ).toEqual(["name", "isbn"]);
  });

  it("closes the table on the matching end when the block nests an if", () => {
    const tables = parse(
      `create_table :carts, force: true do |t|
         if ActiveRecord::TestCase.current_adapter?(:Mysql2Adapter)
           t.bigint :id, null: false
         else
           t.bigint :id, null: false
         end
         t.string :title
       end
       create_table :after, force: true do |t|
         t.string :name
       end`,
    );
    expect(
      columnsOfTable(`create_table :after, force: true do |t|\nt.string :name\nend`, "after"),
    ).toEqual(["name"]);
    expect([...tables.keys()]).toEqual(["carts", "after"]);
    expect([...tables.get("carts")!.columns.keys()]).toEqual(["id", "title"]);
  });

  it("parses a receiver-qualified create_table", () => {
    const tables = parse(
      `Course.lease_connection.create_table :courses, force: true do |t|
         t.column :name, :string, null: false
       end
       OtherDog.lease_connection.create_table :other_dogs, force: true`,
    );
    expect([...tables.get("courses")!.columns.keys()]).toEqual(["name"]);
    expect(tables.has("other_dogs")).toBe(true);
  });

  it("expands a literal-array each loop into one table per name", () => {
    const tables = parse(
      `[:circles, :squares, :triangles].each do |t|
         create_table(t, force: true) { }
       end
       create_table :after, force: true do |t|
         t.string :name
       end`,
    );
    expect([...tables.keys()]).toEqual(["circles", "squares", "triangles", "after"]);
    expect(tables.get("circles")!.columns.size).toBe(0);
    // The loop must not swallow the table that follows it.
    expect([...tables.get("after")!.columns.keys()]).toEqual(["name"]);
  });

  it("does not let a second connection clobber an existing table", () => {
    const tables = parse(
      `create_table :dogs, force: true do |t|
         t.string :name
       end
       OtherDog.lease_connection.create_table :dogs, force: true`,
    );
    expect([...tables.get("dogs")!.columns.keys()]).toEqual(["name"]);
  });

  it("marks a table dynamic when a column name is interpolated or computed", () => {
    const tables = parse(
      `create_table :integer_limits, force: true do |t|
         t.integer :c_int_without_limit
         (1..8).each do |i|
           t.integer :"c_int_#{i}", limit: i
         end
       end
       create_table :accounts, force: true do |t|
         t.integer "a" * max_identifier_length
       end`,
    );
    expect(tables.get("integer_limits")!.dynamic).toBe(true);
    expect(tables.get("accounts")!.dynamic).toBe(true);
  });

  it("strips trailing comments but keeps # inside string literals", () => {
    const table = parse(
      `create_table :xs, force: true do |t|
         t.string :name # a comment
         t.string :tag, default: "#hash"
       end`,
    ).get("xs")!;
    expect([...table.columns.keys()]).toEqual(["name", "tag"]);
    expect(table.columns.get("tag")!.options.default).toBe('"#hash"');
  });

  it("gathers a create_table whose parenthesised args wrap across lines", () => {
    const tables = parse(
      `create_table(:measurements_toronto, id: false, force: true,
                    options: "PARTITION OF measurements FOR VALUES IN (1)")
       create_table :after, force: true do |t|
         t.string :name
       end`,
    );
    expect(tables.has("measurements_toronto")).toBe(true);
    // The continuation must not swallow the table that follows it.
    expect([...tables.get("after")!.columns.keys()]).toEqual(["name"]);
  });
});

describe("compareSchemas", () => {
  const rails = parse(
    `create_table :accounts, force: true do |t|
       t.string :firm_name
       t.integer :credit_limit
     end
     create_table :owners, primary_key: :owner_id, force: true do |t|
       t.string :name
     end
     create_table :integer_limits, force: true do |t|
       t.integer :"c_int_#{i}"
     end`,
  );

  it("flags a table with no create_table in schema.rb", () => {
    const schema: Schema = { invented: { name: "string" } };
    expect(verdicts(compareSchemas(schema, rails))).toEqual(["INVENTED-TABLE:invented"]);
  });

  it("flags a column absent from the create_table block", () => {
    const schema: Schema = { accounts: { firm_name: "string", region_id: "integer" } };
    expect(verdicts(compareSchemas(schema, rails))).toContain("INVENTED-COLUMN:accounts.region_id");
  });

  it("does not flag a primary-key column spelled out in TEST_SCHEMA", () => {
    const schema: Schema = { owners: { owner_id: "integer", name: "string" } };
    expect(compareSchemas(schema, rails)).toEqual([]);
  });

  it("suppresses invented-column verdicts on a table it could not fully parse", () => {
    const schema: Schema = { integer_limits: { c_int_1: "integer" } };
    expect(compareSchemas(schema, rails).filter(isFatal)).toEqual([]);
  });

  it("reports a diverging column type as a non-fatal shape warning", () => {
    const schema: Schema = { accounts: { firm_name: "integer", credit_limit: "integer" } };
    const findings = compareSchemas(schema, rails);
    expect(verdicts(findings)).toContain("SHAPE:accounts.firm_name");
    expect(findings.every((f) => !isFatal(f))).toBe(true);
  });

  it("accepts either integer width for a t.references column", () => {
    const withRefs = parse(
      `create_table :cars, force: true do |t|
         t.references :person
       end`,
    );
    for (const type of ["integer", "big_integer"] as const) {
      expect(compareSchemas({ cars: { person_id: type } }, withRefs)).toEqual([]);
    }
  });

  it("reports a Rails column missing from TEST_SCHEMA as non-fatal", () => {
    const findings = compareSchemas({ accounts: { firm_name: "string" } }, rails);
    expect(verdicts(findings)).toEqual(["UNPORTED-COLUMN:accounts.credit_limit"]);
    expect(findings.every((f) => !isFatal(f))).toBe(true);
  });

  it("records the source file a matched table came from", () => {
    const sources = new Map([["accounts", ["postgresql_specific_schema.rb"]]]);
    const findings = compareSchemas(
      { accounts: { firm_name: "string", region_id: "integer" } },
      rails,
      sources,
    );
    expect(findings.find((f) => f.verdict === "INVENTED-COLUMN")?.source).toBe(
      "postgresql_specific_schema.rb",
    );
  });

  it("suppresses shape and unported findings for an ambiguous multi-source table", () => {
    // credit_limit is absent from TEST_SCHEMA and firm_name's type diverges;
    // both are phantom for a table whose columns differ by adapter.
    const findings = compareSchemas(
      { accounts: { firm_name: "integer" } },
      rails,
      new Map([["accounts", ["mysql2_specific_schema.rb", "postgresql_specific_schema.rb"]]]),
      new Set(["accounts"]),
    );
    expect(findings).toEqual([]);
  });

  it("still flags a truly-invented column on an ambiguous table", () => {
    // A column real on no adapter variant (union) is a genuine invention.
    const findings = compareSchemas(
      { accounts: { firm_name: "string", made_up: "string" } },
      rails,
      new Map([["accounts", ["mysql2_specific_schema.rb", "postgresql_specific_schema.rb"]]]),
      new Set(["accounts"]),
    );
    expect(verdicts(findings)).toEqual(["INVENTED-COLUMN:accounts.made_up"]);
  });
});

describe("compareSchemas column options", () => {
  const detailFor = (findings: Finding[], column: string) =>
    findings.find((f) => f.verdict === "OPTION" && f.column === column)?.detail ?? "";

  const rails = parse(
    `create_table :widgets, force: true do |t|
       t.string   :name, null: false, limit: 1024
       t.integer  :count, default: 0
       t.decimal  :price, precision: 8, scale: 2
       t.string   :cover, default: "hard"
       t.datetime :stamp, precision: 0
       t.integer  :spread, **default_zero
     end`,
  );

  it("flags a diverging null as a non-fatal option warning", () => {
    const findings = compareSchemas({ widgets: { name: { type: "string", limit: 1024 } } }, rails);
    expect(verdicts(findings)).toContain("OPTION:widgets.name");
    expect(detailFor(findings, "name")).toContain("null: schema.rb false, TEST_SCHEMA true");
    expect(findings.every((f) => !isFatal(f))).toBe(true);
  });

  it("flags a diverging limit", () => {
    const findings = compareSchemas({ widgets: { name: { type: "string", null: false } } }, rails);
    expect(detailFor(findings, "name")).toContain("limit: schema.rb 1024, TEST_SCHEMA —");
  });

  it("flags a diverging default", () => {
    const findings = compareSchemas({ widgets: { count: "integer" } }, rails);
    expect(detailFor(findings, "count")).toContain("default: schema.rb 0, TEST_SCHEMA none");
  });

  it("flags diverging precision and scale", () => {
    const findings = compareSchemas(
      { widgets: { price: { type: "decimal", precision: 8 } } },
      rails,
    );
    expect(detailFor(findings, "price")).toContain("scale: schema.rb 2, TEST_SCHEMA —");
  });

  it("normalises a quoted Rails default before comparing", () => {
    const agree = compareSchemas(
      { widgets: { cover: { type: "string", default: "hard" } } },
      rails,
    );
    expect(agree.some((f) => f.verdict === "OPTION" && f.column === "cover")).toBe(false);
  });

  it("agrees when every option matches", () => {
    expect(
      compareSchemas(
        { widgets: { name: { type: "string", null: false, limit: 1024 } } },
        rails,
      ).some((f) => f.verdict === "OPTION"),
    ).toBe(false);
  });

  it("suppresses option comparison when the Rails options are a **splat", () => {
    const findings = compareSchemas({ widgets: { spread: "integer" } }, rails);
    expect(findings.some((f) => f.verdict === "OPTION")).toBe(false);
  });

  it("tolerates precision: null paired with a function default", () => {
    const stamps = parse(
      `create_table :clocks, force: true do |t|
         t.datetime :at, default: -> { "CURRENT_TIMESTAMP" }
       end`,
    );
    const findings = compareSchemas(
      {
        clocks: { at: { type: "datetime", precision: null, defaultFunction: "CURRENT_TIMESTAMP" } },
      },
      stamps,
    );
    expect(findings.some((f) => f.verdict === "OPTION")).toBe(false);
  });
});

describe("normalizeRailsDefault", () => {
  it("reads nil and an omitted default as none", () => {
    expect(normalizeRailsDefault(undefined)).toBe("none");
    expect(normalizeRailsDefault("nil")).toBe("none");
  });

  it("collapses a lambda default to a function tag", () => {
    expect(normalizeRailsDefault(`-> { "CURRENT_TIMESTAMP" }`)).toBe("fn");
  });

  it("unquotes string, numeric, and boolean literals", () => {
    expect(normalizeRailsDefault(`"hard"`)).toBe('"hard"');
    expect(normalizeRailsDefault("0")).toBe("0");
    expect(normalizeRailsDefault("false")).toBe("false");
  });
});

describe("optionRegressions", () => {
  const findings: Finding[] = [
    { verdict: "OPTION", table: "t", column: "a", detail: "" },
    { verdict: "OPTION", table: "t", column: "b", detail: "" },
    { verdict: "SHAPE", table: "t", column: "c", detail: "" },
  ];

  it("stays report-only while the count is within the ceiling", () => {
    expect(optionRegressions(findings, 2)).toEqual([]);
  });

  it("turns every option finding fatal once the ceiling is exceeded", () => {
    expect(optionRegressions(findings, 1).map((f) => f.column)).toEqual(["a", "b"]);
    expect(optionRegressions(findings, 0).map((f) => f.column)).toEqual(["a", "b"]);
  });
});

describe("partitionFindings", () => {
  const findings: Finding[] = [
    { verdict: "INVENTED-TABLE", table: "t", detail: "" },
    { verdict: "SHAPE", table: "t", column: "a", detail: "" },
    { verdict: "UNPORTED-COLUMN", table: "t", column: "b", detail: "" },
    { verdict: "OPTION", table: "t", column: "c", detail: "" },
    { verdict: "OPTION", table: "t", column: "d", detail: "" },
  ];

  it("keeps OPTION findings out of the shape-warning bucket", () => {
    const { shape } = partitionFindings(findings, 2);
    expect(shape.map((f) => f.column)).toEqual(["a", "b"]);
  });

  it("routes OPTION findings to the soft bucket while within the ceiling", () => {
    const { option, optionFatal } = partitionFindings(findings, 2);
    expect(option.map((f) => f.column)).toEqual(["c", "d"]);
    expect(optionFatal).toEqual([]);
  });

  it("moves OPTION findings to the fatal bucket once the ceiling is exceeded", () => {
    const { option, optionFatal } = partitionFindings(findings, 1);
    expect(option).toEqual([]);
    expect(optionFatal.map((f) => f.column)).toEqual(["c", "d"]);
  });
});

describe("optionMismatches", () => {
  it("treats an omitted Rails null as nullable", () => {
    expect(optionMismatches({}, "string")).toEqual([]);
    expect(optionMismatches({}, { type: "string", null: false })).toEqual([
      "null: schema.rb true, TEST_SCHEMA false",
    ]);
  });
});

describe("unresolvedCallSites", () => {
  it("returns nothing when every call site resolved", () => {
    expect(
      unresolvedCallSites(`create_table :accounts, force: true do |t|\n  t.string :name\nend`),
    ).toEqual([]);
  });

  it("names a create_table whose table name it cannot resolve", () => {
    const unresolved = unresolvedCallSites(`create_table SOME_CONSTANT, force: true do |t|\nend`);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain("SOME_CONSTANT");
  });

  it("ignores a create_table that only appears in a comment", () => {
    expect(unresolvedCallSites(`# create_table :ghost, force: true do |t|`)).toEqual([]);
  });

  it("reports a block left unterminated at EOF", () => {
    expect(
      unresolvedCallSites(`create_table :x, force: true do |t|\n  t.string :name`),
    ).toHaveLength(1);
  });
});

describe("applyBaseline", () => {
  const findings: Finding[] = [
    { verdict: "INVENTED-TABLE", table: "known_table", detail: "" },
    { verdict: "INVENTED-TABLE", table: "new_table", detail: "" },
    { verdict: "INVENTED-COLUMN", table: "accounts", column: "known_col", detail: "" },
    { verdict: "SHAPE", table: "accounts", column: "firm_name", detail: "" },
  ];
  const baseline = { tables: ["known_table", "gone_table"], columns: ["accounts.known_col"] };

  it("separates new inventions from baselined debt", () => {
    const { regressions, known } = applyBaseline(findings, baseline);
    expect(verdicts(regressions)).toEqual(["INVENTED-TABLE:new_table"]);
    expect(verdicts(known)).toEqual([
      "INVENTED-TABLE:known_table",
      "INVENTED-COLUMN:accounts.known_col",
    ]);
  });

  it("reports baseline entries that are no longer invented as stale", () => {
    expect(applyBaseline(findings, baseline).stale).toEqual(["gone_table"]);
  });

  it("never routes a non-fatal finding through the baseline", () => {
    const { regressions, known } = applyBaseline(findings, { tables: [], columns: [] });
    expect([...regressions, ...known].every(isFatal)).toBe(true);
  });
});

// These exercise the real vendored schema.rb rather than a synthetic snippet.
// They are the tests that actually fire on a `pnpm vendor:fetch` bump: the
// synthetic cases above only prove the parser handles forms we already knew about.
describe("against the vendored schema.rb", () => {
  const source = readFileSync(
    new URL("../../vendor/rails/activerecord/test/schema/schema.rb", import.meta.url),
    "utf8",
  );
  const railsTables = parseSchemaRb(source);

  it("resolves every create_table call site the file contains", () => {
    const { unresolved, callSites } = parseSchemaRbWithCoverage(source);
    expect(unresolved).toEqual([]);
    // Guards against the regex quietly matching fewer call sites over time.
    expect(callSites).toBeGreaterThanOrEqual(239);
  });

  // Codex review of #4966: both forms were silently dropped, so ten canonical
  // Rails tables were committed as invented-baseline debt.
  it("parses tables declared on a model's connection outside Schema.define", () => {
    for (const t of ["courses", "colleges", "professors", "courses_professors"]) {
      expect(railsTables.has(t), t).toBe(true);
    }
  });

  it("parses tables declared through a literal-array each loop", () => {
    for (const t of ["circles", "squares", "triangles", "non_poly_ones", "non_poly_twos"]) {
      expect(railsTables.has(t), t).toBe(true);
    }
  });

  it("keeps the primary-connection dogs table, not OtherDog's empty one", () => {
    // schema.rb:559 declares dogs with columns; schema.rb:1462 declares a
    // same-named table in a SECOND database. The latter must not clobber it.
    expect(railsTables.get("dogs")!.columns.size).toBeGreaterThan(0);
  });

  it("resolves the canonical tables TEST_SCHEMA is built on", () => {
    for (const table of ["accounts", "posts", "authors", "topics", "comments"]) {
      expect(railsTables.get(table)?.columns.size, table).toBeGreaterThan(0);
    }
  });

  it("keeps TEST_SCHEMA free of inventions outside the committed baseline", async () => {
    const findings = compareSchemas(TEST_SCHEMA, railsTables);
    const { regressions } = applyBaseline(findings, await readBaseline());
    expect(verdicts(regressions)).toEqual([]);
  });

  it("keeps column-option divergences at or below the committed ceiling", () => {
    expect(optionRegressions(compareSchemas(TEST_SCHEMA, railsTables))).toEqual([]);
  });

  it("holds the invention baseline at or below its committed size", async () => {
    // Ratchet: this number may fall as debt is paid off, never rise.
    const baseline = await readBaseline();
    expect(baseline.tables.length + baseline.columns.length).toBeLessThanOrEqual(91);
  });
});

// The adapter-specific companions (postgresql_specific_schema.rb et al.) declare
// further canonical tables; a TEST_SCHEMA table mirroring one must not be
// flagged invented, and their create_table forms must resolve too.
describe("against the adapter-specific companion schemas", () => {
  it("resolves every create_table call site across all five sources", async () => {
    const { unresolved } = await loadRailsTables();
    expect(unresolved).toEqual([]);
  });

  it("treats a PG-only companion table as canonical and records its source", async () => {
    const { tables, sources } = await loadRailsTables();
    expect(tables.has("uuid_children")).toBe(true);
    expect(sources.get("uuid_children")).toEqual(["postgresql_specific_schema.rb"]);
  });

  it("keeps a create_table whose parenthesised args wrap across physical lines", async () => {
    const { tables } = await loadRailsTables();
    expect(tables.has("measurements_toronto")).toBe(true);
    expect(tables.has("measurements_concepcion")).toBe(true);
  });

  it("keeps a schema.rb table authoritative over a same-named companion", async () => {
    // schema.rb leads, so a table it declares keeps that source, is never
    // mislabelled adapter-scoped, and is not treated as ambiguous.
    const { sources, ambiguous } = await loadRailsTables();
    expect(SCHEMA_FILES[0]).toBe("schema.rb");
    expect(sources.get("accounts")).toEqual(["schema.rb"]);
    expect(ambiguous.has("accounts")).toBe(false);
  });

  it("marks a table declared by several companions ambiguous and unions its columns", async () => {
    // `defaults` is declared in every companion with different columns; Rails
    // loads exactly one variant per adapter, so we cannot pick one — the table
    // is canonical (a superset) but ambiguous.
    const { tables, sources, ambiguous } = await loadRailsTables();
    expect(sources.get("defaults")!.length).toBeGreaterThan(1);
    expect(sources.get("defaults")).not.toContain("schema.rb");
    expect(ambiguous.has("defaults")).toBe(true);
    const columns = tables.get("defaults")!.columns;
    // Union: a column absent from MySQL and one absent from PG both survive.
    expect(columns.has("char3")).toBe(true); // t.text :char3 — not in MySQL
    expect(columns.has("char2_concatenated")).toBe(true); // MySQL only, not in PG
  });
});

describe("compareTranscriptions", () => {
  it("reports a table only one transcription declares", () => {
    expect(compareTranscriptions({ posts: { title: "string" } }, {})).toEqual([
      "posts — declared by TEST_SCHEMA, not laid by the registry",
    ]);
    expect(compareTranscriptions({}, { posts: { title: "string" } })).toEqual([
      "posts — laid by the registry, absent from TEST_SCHEMA",
    ]);
  });

  it("reports a column only one transcription declares", () => {
    expect(
      compareTranscriptions(
        { posts: { title: "string" } },
        { posts: { title: "string", body: "text" } },
      ),
    ).toEqual(["posts.body — declared only by canonical-registry"]);
  });

  it("reports a column whose type or options differ", () => {
    expect(
      compareTranscriptions({ posts: { title: "string" } }, { posts: { title: "text" } }),
    ).toEqual(["posts.title — TEST_SCHEMA string, canonical-registry text"]);
    expect(
      compareTranscriptions(
        { posts: { title: { type: "string", null: false } } },
        { posts: { title: "string" } },
      ),
    ).toEqual(["posts.title — TEST_SCHEMA string null=false, canonical-registry string"]);
  });

  it("says nothing about a documented divergence", () => {
    const table = [...TRANSCRIPTION_DIVERGENCE_ALLOW_LIST.keys()][0]!;
    expect(compareTranscriptions({}, { [table]: { name: "string" } })).toEqual([]);
  });

  it("treats the two spellings of a SQL default as one thing", () => {
    expect(describeSpec({ type: "datetime", defaultFunction: "CURRENT_TIMESTAMP" })).toBe(
      "datetime default=fn",
    );
    // precision: null is a declared value, not an omission (the bare-DATETIME request).
    expect(describeSpec({ type: "datetime", precision: null })).toBe("datetime precision=null");
  });
});

// The registry — not TEST_SCHEMA — is what lays every table at boot, so the same
// invention gate has to hold over it, and the two must not drift apart.
describe("against the canonical registry", () => {
  it("keeps the registry free of inventions outside the committed baseline", async () => {
    const { tables, sources, ambiguous } = await loadRailsTables();
    const findings = compareSchemas(await canonicalRegistrySchema(), tables, sources, ambiguous);
    const { regressions } = applyBaseline(findings, await readBaseline());
    expect(verdicts(regressions)).toEqual([]);
  });

  it("keeps the registry's column-option divergences at or below the committed ceiling", async () => {
    const { tables, sources, ambiguous } = await loadRailsTables();
    expect(
      optionRegressions(
        compareSchemas(await canonicalRegistrySchema(), tables, sources, ambiguous),
      ),
    ).toEqual([]);
  });

  it("keeps the two transcriptions of schema.rb in sync", async () => {
    expect(compareTranscriptions(TEST_SCHEMA, await canonicalRegistrySchema())).toEqual([]);
  });

  it("recovers the declared column shape rather than one adapter's rendering", async () => {
    const registry = await canonicalRegistrySchema();
    // big_integer, not SQLite's `bigint` spelling; a declared limit survives.
    expect(describeSpec(columnsOfRegistry(registry, "admin_users", "settings"))).toBe(
      "string limit=1024 null=true",
    );
    expect(describeSpec(columnsOfRegistry(registry, "aircraft", "manufactured_at"))).toBe(
      "datetime precision=null default=fn",
    );
  });
});

function columnsOfRegistry(registry: Schema, table: string, column: string) {
  return (registry[table] as Record<string, ColumnSpec>)[column]!;
}
