import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { declaredTableNames, parseSchemaRb } from "./parse-schema-rb.js";
import { applyBaseline, compareSchemas, isFatal, readBaseline, unparsedTables } from "./compare.js";
import { TEST_SCHEMA } from "../../packages/activerecord/src/test-helpers/test-schema.js";
import type { Finding } from "./compare.js";
import type { Schema } from "../../packages/activerecord/src/test-helpers/schema-types.js";

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
});

describe("unparsedTables", () => {
  const rb = `create_table :accounts, force: true do |t|
       t.string :name
     end
     create_table :posts, force: true do |t|
       t.string :title
     end`;

  it("returns nothing when every declared table parsed", () => {
    expect(unparsedTables(`ActiveRecord::Schema.define do\n${rb}\nend\n`, parse(rb))).toEqual([]);
  });

  it("names a declared table the parser dropped", () => {
    const dropped = new Map(parse(rb));
    dropped.delete("posts");
    expect(unparsedTables(`ActiveRecord::Schema.define do\n${rb}\nend\n`, dropped)).toEqual([
      "posts",
    ]);
  });

  it("ignores a create_table that only appears in a comment", () => {
    const withComment = `# create_table :ghost, force: true do |t|\n${rb}`;
    expect(
      unparsedTables(`ActiveRecord::Schema.define do\n${withComment}\nend\n`, parse(withComment)),
    ).toEqual([]);
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

  it("parses every create_table the file declares", () => {
    expect(unparsedTables(source, railsTables)).toEqual([]);
    expect(railsTables.size).toBe(new Set(declaredTableNames(source)).size);
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

  it("holds the invention baseline at or below its committed size", async () => {
    // Ratchet: this number may fall as debt is paid off, never rise.
    const baseline = await readBaseline();
    expect(baseline.tables.length + baseline.columns.length).toBeLessThanOrEqual(100);
  });
});
