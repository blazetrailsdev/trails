import { describe, it, expect, afterAll } from "vitest";
// prettier-ignore
import { stripErb, isRefLike, compareValue, compareFile, schemaCheck, canonicalizeRailsRow } from "./compare.js";
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
  it("compares array values structurally (postgres text[] etc.)", () => {
    expect(cmp(["a", "b"], ["a", "b"])[0]).toBe(true);
    expect(cmp(["a", "b"], ["a", "c"])[0]).toBe(false);
    expect(cmp(["a"], ["a", "b"])[0]).toBe(false);
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

describe("canonicalizeRailsRow", () => {
  const cols = new Set(["id", "name", "pirate_id", "pirate_type", "club_id"]);
  it("passes column-named keys through unchanged", () => {
    expect(canonicalizeRailsRow({ id: 1, name: "x" }, {}, cols)).toEqual({ id: 1, name: "x" });
  });
  it("expands `assoc: name` belongs_to short-hand into assoc_id", () => {
    expect(canonicalizeRailsRow({ pirate: "blackbeard" }, {}, cols)).toEqual({
      pirate_id: "blackbeard",
    });
  });
  it("expands polymorphic `assoc: name (Type)` into assoc_id + assoc_type", () => {
    expect(canonicalizeRailsRow({ pirate: "blackbeard (Pirate)" }, {}, cols)).toEqual({
      pirate_id: "blackbeard",
      pirate_type: "Pirate",
    });
  });
  it("drops keys whose `_id` form isn't a column (HABTM / unknown assoc)", () => {
    expect(canonicalizeRailsRow({ treasures: "diamond, sapphire" }, {}, cols)).toEqual({});
  });
  it("falls back to tsRow keys when no schema columns are available, preserving unknown Rails keys", () => {
    // Without schema we can't distinguish HABTM from a column the TS side
    // dropped, so an unknown Rails key must survive to be flagged as
    // `missing-in-ts` downstream — not silently dropped.
    expect(canonicalizeRailsRow({ pirate: "x" }, { pirate_id: 1 }, null)).toEqual({
      pirate_id: "x",
    });
    expect(canonicalizeRailsRow({ company: "acme" }, {}, null)).toEqual({ company: "acme" });
  });
});

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRailsYamlForTest } from "./compare.js";
describe("loadRailsYaml (parsing fidelity)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "fixtures-compare-"));
  const write = (basename: string, contents: string): string => {
    const p = join(tmp, `${basename}.yml`);
    writeFileSync(p, contents);
    return p;
  };
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("expands `<<: *ANCHOR` merge keys (yaml `merge: true`)", () => {
    const r = loadRailsYamlForTest(
      write("merge", "DEFAULTS: &D\n  color: red\nrow1:\n  <<: *D\n  name: x\n"),
      "merge",
    );
    expect(r).toEqual({ ok: true, data: { DEFAULTS: { color: "red" }, row1: { color: "red", name: "x" } } }); // prettier-ignore
  });

  it("strips `_fixture` metadata and honors `_fixture.ignore`", () => {
    const r = loadRailsYamlForTest(
      write("ig", "_fixture:\n  ignore: SKIP_ME\nSKIP_ME:\n  x: 1\nkeep:\n  y: 2\n"),
      "ig",
    );
    expect(r).toEqual({ ok: true, data: { keep: { y: 2 } } });
  });

  it("auto-labels list-form fixtures as `<basename>_<index>`", () => {
    const r = loadRailsYamlForTest(write("list", "- name: Foo\n- name: Bar\n"), "list");
    expect(r).toEqual({ ok: true, data: { list_0: { name: "Foo" }, list_1: { name: "Bar" } } });
  });

  it("keeps list-form entries with array/scalar single-key values (not misclassified as labeled)", () => {
    // `- tags: [a, b]` is one bare list-form row, not a labeled `tags:` omap
    // entry. Without the `--- !omap` doc tag, array entries always auto-label
    // regardless of shape.
    const r = loadRailsYamlForTest(write("listarr", "- tags:\n    - a\n    - b\n  name: x\n"), "listarr"); // prettier-ignore
    expect(r).toEqual({ ok: true, data: { listarr_0: { tags: ["a", "b"], name: "x" } } });
  });

  it("honors `_fixture.ignore` inside a `!omap` document (entry, not top-level key)", () => {
    const r = loadRailsYamlForTest(
      write("omig", "--- !omap\n- _fixture:\n    ignore: SKIP\n- SKIP:\n    x: 1\n- keep:\n    y: 2\n"), // prettier-ignore
      "omig",
    );
    expect(r).toEqual({ ok: true, data: { keep: { y: 2 } } });
  });

  it("auto-labels single-key list-form rows even when the value is a nested object", () => {
    // `- settings: { theme: dark }` is a bare row with column `settings`,
    // not a labeled omap entry. Requires the explicit `--- !omap` doc tag
    // to opt into label-preserving flattening; without it we auto-label.
    const r = loadRailsYamlForTest(write("lk", "- settings:\n    theme: dark\n"), "lk");
    expect(r).toEqual({ ok: true, data: { lk_0: { settings: { theme: "dark" } } } });
  });

  it("preserves labels on `!omap` arrays via the document tag", () => {
    const r = loadRailsYamlForTest(
      write("om", "--- !omap\n- alpha:\n    n: 1\n- beta:\n    n: 2\n"),
      "om",
    );
    expect(r).toEqual({ ok: true, data: { alpha: { n: 1 }, beta: { n: 2 } } });
  });

  it("ignores prototype keys when canonicalizing without a schema", () => {
    // toString isn't a column; with `in` it would short-circuit known(); use
    // Object.hasOwn so the Rails key still surfaces as missing-in-ts drift.
    expect(canonicalizeRailsRow({ toString: "x" }, {}, null)).toEqual({ toString: "x" });
  });

  it("interpolates `$LABEL` to the row name on scalar string values", () => {
    const r = loadRailsYamlForTest(write("lab", "polly:\n  name: $LABEL\n  breed: $LABEL bird\n"), "lab"); // prettier-ignore
    expect(r).toEqual({ ok: true, data: { polly: { name: "polly", breed: "polly bird" } } });
  });

  it("returns ERB-UNSUPPORTED for ERB other than the adapter_name stub", () => {
    const r = loadRailsYamlForTest(write("erb", "<% 3.times do %>x: 1<% end %>\n"), "erb");
    expect(r).toEqual({ ok: false, reason: "ERB-UNSUPPORTED" });
  });
});

describe("compareFile", () => {
  const empty = new Map();
  it("returns MISSING when the TS counterpart doesn't exist", async () => {
    const rows = new Map([["nonexistent_fixture_xyz", { row1: { id: 1 } }]]);
    const r = await compareFile("nonexistent_fixture_xyz.yml", rows, empty, undefined);
    expect(r.status).toBe("MISSING");
    expect(r.tsBase).toBeNull();
  });
  it("propagates a prelim YAML-PARSE-ERR untouched", async () => {
    expect((await compareFile("authors.yml", empty, empty, "YAML-PARSE-ERR")).status).toBe(
      "YAML-PARSE-ERR",
    );
  });
});
