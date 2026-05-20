import { describe, it, expect } from "vitest";
import { stripErb, isRefLike, compareValue, compareFile, schemaCheck } from "./compare.js";
import type { Schema } from "../../packages/activerecord/src/test-helpers/define-schema.js";

// prettier-ignore
const idIndex = new Map<string, Map<number, string[]>>([["authors", new Map([[1, ["david"]], [2, ["mary"]], [3, ["dup_a", "dup_b"]]])]]);
const ref = (table: string, name: string) => ({ tableName: table, fixtureName: name });
const cmp = (ts: unknown, rails: unknown, notes: string[] = []) =>
  [compareValue(ts, rails, "x", idIndex, notes), notes] as const;

it("stripErb stubs adapter_name; flags other tags as unsupported", () => {
  expect(stripErb("a <%= ActiveRecord::Base.connection.adapter_name %> b")).toEqual({ rendered: "a SQLite b", unsupported: false }); // prettier-ignore
  expect(stripErb("<% 3.times do %>x<% end %>").unsupported).toBe(true);
  expect(stripErb("id: 1").unsupported).toBe(false);
});

it("isRefLike only accepts shapes with both string fields", () => {
  expect(isRefLike(ref("authors", "david"))).toBe(true);
  expect(isRefLike({ tableName: "x" })).toBe(false);
  expect(isRefLike(null)).toBe(false);
});

describe("compareValue", () => {
  it("reverse-resolves numeric FK → ref via id index", () => {
    expect(cmp(ref("authors", "david"), 1)[0]).toBe(true);
  });
  it("flags wrong row-name behind a numeric FK", () => {
    const [ok, notes] = cmp(ref("authors", "mary"), 1);
    expect(ok).toBe(false);
    expect(notes[0]).toMatch(/id=1.*"david"/);
  });
  it("flags ambiguous-fk when the target id maps to multiple rows", () => {
    expect(cmp(ref("authors", "dup_a"), 3)[1][0]).toMatch(/^ambiguous-fk:/);
  });
  it("matches string FK against fixtureName; otherwise flags value-differs", () => {
    expect(cmp(ref("e", "modest"), "modest")[0]).toBe(true);
    expect(cmp("a", "b")[1][0]).toMatch(/^value-differs:/);
  });
});

describe("schemaCheck", () => {
  const schema: Schema = {
    authors: { name: "string" },
    wrapped: { columns: { name: "string" }, primaryKey: ["name"] },
  };
  it("reports not-ported when the table isn't in TEST_SCHEMA", () => {
    const out = schemaCheck("pirates", { blackbeard: { id: 1 } }, schema, []);
    expect(out).toEqual({ ported: false, extras: 0 });
  });
  it("allows implicit `id` and declared columns", () => {
    const notes: string[] = [];
    const out = schemaCheck("authors", { david: { id: 1, name: "David" } }, schema, notes);
    expect(out).toEqual({ ported: true, extras: 0 });
    expect(notes).toEqual([]);
  });
  it("flags columns not declared in TEST_SCHEMA", () => {
    const notes: string[] = [];
    const out = schemaCheck("authors", { david: { id: 1, name: "D", bogus: 1 } }, schema, notes);
    expect(out).toEqual({ ported: true, extras: 1 });
    expect(notes[0]).toMatch(/^schema-extra-col: david\.bogus/);
  });
  it("reads columns from the WrappedTableSchema shape; composite PK suppresses implicit `id`", () => {
    // define-schema.ts sets createOpts.id = false for both primaryKey:false
    // and primaryKey:string[], so any wrapped table that lists `id` in a
    // fixture row is drift.
    expect(schemaCheck("wrapped", { row: { name: "n" } }, schema, []).extras).toBe(0);
    expect(schemaCheck("wrapped", { row: { id: 1, name: "n" } }, schema, []).extras).toBe(1);
    expect(schemaCheck("wrapped", { row: { name: "n", extra: 1 } }, schema, []).extras).toBe(1);
  });
  it("flags `id` as drift on a wrapped table with primaryKey: false (no implicit id column)", () => {
    const pkFalse: Schema = { sessions: { columns: { token: "string" }, primaryKey: false } };
    const notes: string[] = [];
    const out = schemaCheck("sessions", { s1: { id: 1, token: "abc" } }, pkFalse, notes);
    expect(out.extras).toBe(1);
    expect(notes[0]).toMatch(/^schema-extra-col: s1\.id /);
  });
});

describe("compareFile + schema integration", () => {
  // authors is in TEST_SCHEMA (PR 0.5a A-tables group); use it to prove
  // schemaPorted/schemaExtras flow through compareFile and that extras flip
  // an otherwise-MATCH row into DIFF. Use the schema-arg override so the
  // assertions stay decoupled from how TEST_SCHEMA evolves.
  const railsAuthorsLike: Record<string, Record<string, unknown>> = {
    david: { id: 1, name: "David" },
  };
  const rows = () => new Map([["authors", railsAuthorsLike]]);

  it("populates schemaPorted=true when the table is in the supplied schema", async () => {
    // Schema mirrors every non-id column authors.ts uses so extras stays 0
    // and the assertion proves the ported path, not a row-shape coincidence.
    const r = await compareFile("authors.yml", rows(), new Map(), undefined, {
      authors: {
        name: "string",
        author_address_id: "integer",
        author_address_extra_id: "integer",
        owned_essay_id: "integer",
        organization_id: "string",
      },
    });
    expect(r.schemaPorted).toBe(true);
    expect(r.schemaExtras).toBe(0);
  });

  it("propagates schemaPorted=false when the supplied schema omits the table", async () => {
    // Empty schema → ported=false even though the TS file exists. Proves
    // the path through schemaCheck, not just the FileResult initializer.
    const r = await compareFile("authors.yml", rows(), new Map(), undefined, {});
    expect(r.schemaPorted).toBe(false);
    expect(r.schemaExtras).toBe(0);
  });

  it("flips status to DIFF and counts extras when the TS row uses an undeclared column", async () => {
    // Force a schema that declares only `id` (no `name`). authors.ts has a
    // `name` field, so every row should flag exactly one extra.
    const r = await compareFile("authors.yml", rows(), new Map(), undefined, {
      authors: {},
    });
    expect(r.schemaPorted).toBe(true);
    expect(r.schemaExtras).toBeGreaterThan(0);
    expect(r.status).toBe("DIFF");
    expect(r.notes.some((n) => /^schema-extra-col: .*\.name/.test(n))).toBe(true);
  });
});

describe("compareFile", () => {
  const empty = new Map();
  it("returns MISSING when the TS counterpart doesn't exist", async () => {
    const rows = new Map([["pirates", { blackbeard: { id: 1 } }]]);
    const r = await compareFile("pirates.yml", rows, empty, undefined);
    expect(r.status).toBe("MISSING");
    expect(r.tsBase).toBeNull();
  });
  it("propagates a prelim YAML-PARSE-ERR untouched", async () => {
    expect((await compareFile("authors.yml", empty, empty, "YAML-PARSE-ERR")).status).toBe(
      "YAML-PARSE-ERR",
    );
  });
});
