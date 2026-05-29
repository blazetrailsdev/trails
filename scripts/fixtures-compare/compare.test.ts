import { describe, it, expect, afterAll } from "vitest";
// prettier-ignore
import { stripErb, isRefLike, compareValue, compareFile, schemaCheck, canonicalizeRailsRow, ERB_SKIP_SENTINEL, tsModelPath, compareModelClass, buildIdIndexForTest, loadRailsYamlForTest } from "./compare.js";
import type { RubyClass } from "./compare.js";
import type { Schema } from "../../packages/activerecord/src/test-helpers/define-schema.js";

// prettier-ignore
const idIndex = new Map<string, Map<number, string[]>>([["authors", new Map([[1, ["david"]], [2, ["mary"]], [3, ["dup_a", "dup_b"]]])]]);
const ref = (table: string, name: string) => ({ tableName: table, fixtureName: name });
const cmp = (ts: unknown, rails: unknown, notes: string[] = []) =>
  [compareValue(ts, rails, "x", idIndex, notes), notes] as const;

it("stripErb stubs adapter_name; flags other tags as unsupported", () => {
  expect(stripErb("a <%= ActiveRecord::Base.connection.adapter_name %> b")).toEqual({ rendered: "a SQLite b", unsupported: false }); // prettier-ignore
  expect(stripErb("<% 3.times do |z| %>x<% end %>").unsupported).toBe(false);
  expect(stripErb("<% [[1,2],[3,4]].each do |s| %>x<% end %>").unsupported).toBe(true);
  expect(stripErb("id: 1").unsupported).toBe(false);
});

describe("stripErb ERB expanders", () => {
  it("expands `<%= FixtureSet.identify(:label) %>` to its CRC32 value (mirrors fixtureId)", () => {
    const out = stripErb("pirate_id: <%= ActiveRecord::FixtureSet.identify(:blackbeard) %>");
    // Stable, deterministic — pin the actual computed value.
    expect(out.rendered).toBe("pirate_id: 959118195");
    expect(out.unsupported).toBe(false);
  });
  it("expands `composite_identify(:l, [:a, :b])[:b]` per (identify<<index) % MAX_ID", () => {
    const out = stripErb("k: <%= ActiveRecord::FixtureSet.composite_identify(:order_1, [:shop_id, :id])[:id] %>"); // prettier-ignore
    expect(out.rendered).toBe("k: 997509437");
    expect(out.unsupported).toBe(false);
  });
  it("sentinelizes `composite_identify` when the accessor key isn't in the literal key list", () => {
    // Defensive: if a Rails fixture ever asked for an accessor not in the
    // declared `[:a, :b]` array, the file should still parse — that single
    // attr becomes an erb-skip rather than blowing up the whole file.
    const out = stripErb("k: <%= ActiveRecord::FixtureSet.composite_identify(:order_1, [:shop_id, :id])[:ghost] %>"); // prettier-ignore
    expect(out.rendered).toBe(`k: ${ERB_SKIP_SENTINEL}`);
    expect(out.unsupported).toBe(false);
  });
  it("expands `(lo..hi).each do |v|` loops with <%= v %> body interpolation", () => {
    const { rendered, unsupported } = stripErb("<% (1..3).each do |i| %>row_<%= i %>: { id: <%= i %> }\n<% end %>"); // prettier-ignore
    expect(rendered.trim()).toBe("row_1: { id: 1 }\nrow_2: { id: 2 }\nrow_3: { id: 3 }");
    expect(unsupported).toBe(false);
  });
  it("expands `N.times do |v|` loops; evaluates simple arithmetic in body", () => {
    const { rendered } = stripErb("<% 2.times do |i| %>x<%= i+10 %>=<%= i*i %>;<% end %>");
    expect(rendered).toBe("x10=0;x11=1;");
  });
  it("interpolates `#{v}` inside loop bodies", () => {
    const { rendered } = stripErb("<% 2.times do |i| %>n=#{i+1};<% end %>");
    expect(rendered).toBe("n=1;n=2;");
  });
  it("skips loops above the row-count cap so YAML parsing doesn't stall", () => {
    // citations.yml expands 65536 rows in Rails. We leave it as
    // ERB-UNSUPPORTED rather than spend seconds parsing megabytes.
    const out = stripErb("<% 65536.times do |i| %>r_<%= i %>:\n  id: <%= i %>\n<% end %>");
    expect(out.unsupported).toBe(true);
  });
  it("falls back to sentinel on `/` (Ruby integer-div vs JS float-div mismatch)", () => {
    // Ruby `5/2 = 2` (truncate toward -∞); JS `5/2 = 2.5`. Silently producing
    // 2.5 in a fixture id would diverge from Rails — fall through to sentinel.
    const { rendered } = stripErb("<% 1.times do |i| %>k: <%= 5/2 %>;<% end %>");
    expect(rendered).toBe(`k: ${ERB_SKIP_SENTINEL};`);
  });
  it("sentinelizes residual opaque `<%= ... %>` (e.g. 2.weeks.ago.to_fs)", () => {
    const out = stripErb("c: <%= 2.weeks.ago.to_fs(:db) %>");
    expect(out.unsupported).toBe(false);
    expect(out.rendered).toBe(`c: ${ERB_SKIP_SENTINEL}`);
  });
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

  it("counts attrs whose Rails value is the ERB skip sentinel without flagging DIFF", async () => {
    // Mirrors what stripErb does for `<%= 2.weeks.ago... %>`: the Rails
    // value parses as the sentinel string; the per-attr diff skips it
    // (and excludes it from attrsTotal so the % stays accurate).
    // authors.ts:david doesn't carry `name` — pick `author_address_id`,
    // which it does have, so the presence check passes and the sentinel
    // skip path runs. Without the presence check, this would have
    // matched as 0===0 noise; with it, attrsSkipped is the right signal.
    const rowsWithSentinel = new Map([
      ["authors", { david: { id: 1, author_address_id: ERB_SKIP_SENTINEL } }],
    ]);
    const r = await compareFile("authors.yml", rowsWithSentinel, new Map(), undefined, {
      authors: { author_address_id: "integer" },
    });
    expect(r.attrsSkipped).toBe(1);
    expect(r.notes.some((n) => /missing-in-ts: david\.author_address_id/.test(n))).toBe(false);
  });

  it("still flags missing-in-ts when the TS row drops a sentinel-valued attr", async () => {
    // Sentinel skip must not mask real fixture drift: if Rails carries the
    // attribute (even as opaque ERB) and TS dropped it, that's a port gap.
    // `bogus_only` is a column in the supplied schema so canonicalizeRailsRow
    // preserves it; TS authors.ts doesn't have it → must surface as
    // missing-in-ts rather than silently incrementing attrsSkipped.
    const rowsSentinelMissingInTs = new Map([
      ["authors", { david: { id: 1, bogus_only: ERB_SKIP_SENTINEL } }],
    ]);
    const r = await compareFile("authors.yml", rowsSentinelMissingInTs, new Map(), undefined, {
      authors: { bogus_only: "string" },
    });
    expect(r.attrsSkipped).toBe(0);
    expect(r.notes.some((n) => /missing-in-ts: david\.bogus_only/.test(n))).toBe(true);
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

  it("SKIP_ATTRS suppresses a Rails-only column without flagging missing-in-ts, keeping the % accurate", async () => {
    // `binaries.data` is in SKIP_ATTRS: the `!binary` blob isn't mirrored in
    // binaries.ts (rows carry only `id`). Even though the Rails side declares
    // `data`, it must be a soft skip — not `missing-in-ts` — and excluded from
    // attrsTotal so the percentage stays at the real-column ratio.
    const railsBinaries = new Map([
      [
        "binaries",
        { flowers: { id: 1, data: "<blob>" }, binary_helper: { id: 2, data: "<blob>" } },
      ],
    ]);
    const r = await compareFile("binaries.yml", railsBinaries, new Map(), undefined, {
      binaries: { data: "binary" },
    });
    // (1) the skipped attr never surfaces as drift…
    expect(r.notes.some((n) => /-in-ts: \w+\.data/.test(n))).toBe(false);
    // (2) …it increments attrsSkipped once per row…
    expect(r.attrsSkipped).toBe(2);
    // (3) …and attrsTotal counts only the real columns (the two `id`s), so the
    // ratio is a clean 2/2 MATCH rather than being diluted to 2/4.
    expect(r.attrsTotal).toBe(2);
    expect(r.attrsMatched).toBe(2);
    expect(r.status).toBe("MATCH");
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
  it("maps an FK_OVERRIDES assoc to its declared column (sponsors.sponsor_club → club_id)", () => {
    // `sponsor_club` doesn't follow the `<assoc>_id` convention; the override
    // routes it to the real `club_id` column.
    expect(canonicalizeRailsRow({ sponsor_club: "moustache_club" }, {}, cols, "sponsors")).toEqual({
      club_id: "moustache_club",
    });
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
  it("promotes allow-listed ERB-UNSUPPORTED to ERB-ALLOWED so the strict flip ignores them", async () => {
    // mixins/paragraphs/citations are documented stragglers — their TS side
    // is the source of truth, the Rails YAML never reduces. Allow-list lets
    // PR 7b flip strict without re-classifying these as failures.
    const r = await compareFile("paragraphs.yml", empty, empty, "ERB-UNSUPPORTED");
    expect(r.status).toBe("ERB-ALLOWED");
    // Non-allow-listed files keep the original status.
    const other = await compareFile("not_on_the_list.yml", empty, empty, "ERB-UNSUPPORTED");
    expect(other.status).toBe("ERB-UNSUPPORTED");
  });
  it("records `tsBase` on the ERB-ALLOWED result so a deleted TS counterpart can be caught", async () => {
    // ERB-ALLOWED files are the TS-as-source-of-truth bucket; the
    // promotion in compareFile only succeeds when the TS counterpart
    // exists (else falls back to MISSING). Asserting on `tsBase` makes
    // that contract visible: if mixins.ts is removed from the tree, this
    // resolves to null and the status branch flips to MISSING.
    const r = await compareFile("mixins.yml", empty, empty, "ERB-UNSUPPORTED");
    expect(r.status).toBe("ERB-ALLOWED");
    expect(r.tsBase).toBe("mixins.ts");
  });
});

describe("datetime / serialized-YAML tolerance", () => {
  // Rails fixtures store sub-second precision the TS side often trims; both
  // halves of `compareValue`'s datetime path round to whole-second equality.
  it("treats identical instants written with `T`/space and fractional seconds as equal", () => {
    expect(cmp("2003-07-16 14:28:11", "2003-07-16T15:28:11.2233+01:00")[0]).toBe(true);
  });
  it("forces UTC when the bare datetime string has no timezone marker", () => {
    // No tz on either side → both interpreted UTC; otherwise this assertion
    // would be host-tz dependent (failure mode the regression guards against).
    expect(cmp("2003-07-16 14:28:11", "2003-07-16T14:28:11")[0]).toBe(true);
  });
  it("compares time-of-day against a Rails datetime by UTC hour/min/sec", () => {
    // TIME columns (`bonus_time`) carry `HH:MM:SS` on the TS side but Rails
    // YAML often holds a full datetime; compare the UTC time-of-day only.
    expect(cmp("14:28:00", "2005-01-30T15:28:00.00+01:00")[0]).toBe(true);
    expect(cmp("14:28:00", "2005-01-30T16:28:00.00+01:00")[0]).toBe(false);
  });
  it("flags datetime values that disagree by more than a second", () => {
    const [ok, notes] = cmp("2003-07-16 14:28:11", "2003-07-16T14:28:30Z");
    expect(ok).toBe(false);
    expect(notes[0]).toMatch(/^value-differs:/);
  });
  it("peels Rails' `--- … \\n…\\n` YAML wrapper used for serialize columns", () => {
    expect(cmp("Have a nice day", "--- Have a nice day\n...\n")[0]).toBe(true);
  });
  it("matches an `instanceof Date` Rails value against an ISO string TS value", () => {
    // YAML promotes `!!timestamp`-tagged scalars to Date; the TS side
    // typically still carries the string form.
    expect(cmp("2003-07-16 14:28:11", new Date("2003-07-16T14:28:11Z"))[0]).toBe(true);
  });
  it("normalizes yaml-lib's lowercase `t`/`z` separators to uppercase (spec ISO 8601)", () => {
    // V8 tolerates `2003-07-16t14:28:11z` today, but Date.parse for
    // non-standard variants is engine-defined and stricter runtimes
    // (deno/spec'd) can return NaN. Pin the normalization.
    expect(cmp("2003-07-16 14:28:11", "2003-07-16t14:28:11Z")[0]).toBe(true);
    expect(cmp("2003-07-16 14:28:11", "2003-07-16T14:28:11z")[0]).toBe(true);
  });
  it("handles bare date-only scalars (YYYY-MM-DD) as midnight UTC, not as NaN", () => {
    // Regression: appending `Z` to a date-only string produces invalid ISO
    // (`2024-01-01Z` → Date.parse NaN). Normalize to midnight UTC first.
    expect(cmp("2024-01-01", "2024-01-01")[0]).toBe(true);
    expect(cmp("2024-01-01", new Date("2024-01-01T00:00:00Z"))[0]).toBe(true);
  });
});

describe("enum-symbol comparator", () => {
  it("counts unmapped `:symbol` ↔ integer pairs as a soft skip, not a DIFF", () => {
    // An enum-shaped pair on a table/column with no ENUM_MAPS entry should
    // bump the per-row attrsSkipped counter and return true so unported enum
    // metadata doesn't gate the strict flip.
    const notes: string[] = [];
    const skip = { n: 0 };
    const ok = compareValue(
      2,
      ":published",
      "row.status",
      idIndex,
      notes,
      "unregistered_table",
      skip,
    );
    expect(ok).toBe(true);
    expect(skip.n).toBe(1);
    expect(notes[0]).toMatch(/^enum-unmapped: row\.status/);
  });
  it("ignores enum shape when the rails string isn't a bare identifier", () => {
    // A multi-word string like `"hello world"` isn't a symbol candidate;
    // fall through to value-differs so we don't paper over a real mismatch.
    const [ok, notes] = cmp(1, "hello world");
    expect(ok).toBe(false);
    expect(notes[0]).toMatch(/^value-differs:/);
  });
  it("requires the `:` prefix to soft-skip — bare string ↔ number falls through to value-differs", () => {
    // Critical contract: without an ENUM_MAPS entry, `name: 5` vs `name: "five"`
    // is a real mismatch, not an unmapped enum. Only the explicit `:foo`
    // Ruby-symbol form should trigger the unmapped soft-skip; otherwise we'd
    // mask data drift on any number/word column pair.
    const notes: string[] = [];
    const skip = { n: 0 };
    const ok = compareValue(5, "five", "row.count", idIndex, notes, "things", skip);
    expect(ok).toBe(false);
    expect(skip.n).toBe(0);
    expect(notes[0]).toMatch(/^value-differs:/);
  });
  it("resolves a registered enum member from both `:symbol` and bare-string form", () => {
    // ENUM_MAPS["books"].status maps proposed=0/published=2; the Rails side
    // may carry either `:published` (symbol) or `"proposed"` (bare string).
    expect(compareValue(2, ":published", "awdr.status", idIndex, [], "books")).toBe(true);
    expect(compareValue(0, "proposed", "rfr.status", idIndex, [], "books")).toBe(true);
    // A registered map still rejects a genuinely wrong integer.
    expect(compareValue(1, ":published", "awdr.status", idIndex, [], "books")).toBe(false);
  });
  it("matches a nil-mapped enum member (forgotten) against a TS `null`", () => {
    // `enum :last_read, { …, forgotten: nil }` stores NULL; the TS fixture
    // carries `null` and the Rails side the bare string `"forgotten"`.
    expect(compareValue(null, "forgotten", "ddd.last_read", idIndex, [], "books")).toBe(true);
    // A nil-mapped member doesn't match a non-null TS value.
    expect(compareValue(0, "forgotten", "ddd.last_read", idIndex, [], "books")).toBe(false);
  });
  it("never resolves an enum member from Object.prototype keys", () => {
    // `toString`/`constructor` are not declared enum members; the lookup must
    // treat them as unmapped (soft-skip), not pull off the prototype.
    const notes: string[] = [];
    const skip = { n: 0 };
    expect(compareValue(2, ":toString", "row.status", idIndex, notes, "books", skip)).toBe(true);
    expect(skip.n).toBe(1);
    expect(notes[0]).toMatch(/^enum-unmapped:/);
  });
});

describe("buildIdIndex (implicit-id fallback)", () => {
  // Mirrors Rails' `ActiveRecord::FixtureSet.identify(label)` so numeric FK
  // references in *other* fixtures resolve to label-only rows. Highest-impact
  // change in this PR — without it 7+ HABTM/join fixtures soft-failed because
  // their FK targets weren't in the index.
  it("indexes rows with explicit `id:` by that id", () => {
    const idx = buildIdIndexForTest(new Map([["t", { a: { id: 100 }, b: { id: 200 } }]]));
    expect(idx.get("t")?.get(100)).toEqual(["a"]);
    expect(idx.get("t")?.get(200)).toEqual(["b"]);
  });
  it("falls back to CRC32(label) for rows without explicit `id:`", () => {
    // fixtureIdValue("blackbeard") = 959118195 (stable; pinned in stripErb tests).
    const idx = buildIdIndexForTest(new Map([["pirates", { blackbeard: { name: "BB" } }]]));
    expect(idx.get("pirates")?.get(959118195)).toEqual(["blackbeard"]);
  });
  it("keeps explicit id taking precedence over the CRC32 fallback", () => {
    // If a row carries `id: 1`, it must be indexed at 1 — never at CRC32("a").
    const idx = buildIdIndexForTest(new Map([["t", { a: { id: 1, name: "x" } }]]));
    expect(idx.get("t")?.get(1)).toEqual(["a"]);
    expect([...(idx.get("t")?.keys() ?? [])]).toEqual([1]);
  });
  it("skips rows whose explicit `id:` isn't numeric (string PKs, CPK tables)", () => {
    // A row with `id: "abc"` lives in a non-numeric PK space — it must NOT
    // fall through to the CRC32 fallback (would mis-index FK lookups) and
    // can't go into the numeric Map either. Skip cleanly.
    const idx = buildIdIndexForTest(new Map([["t", { a: { id: "abc", name: "x" } }]]));
    expect([...(idx.get("t")?.keys() ?? [])]).toEqual([]);
  });
});

describe("canonicalizeRailsRow + FK_OVERRIDES", () => {
  // The override path is a scaffold for fixtures whose Rails shorthand
  // (`assoc: label`) doesn't follow the `<assoc>_id` column convention.
  // Today no overrides are populated — the contract is that callers can
  // pass a `table` name and an entry in FK_OVERRIDES will redirect the
  // shorthand to the declared column. Tested via a direct call shape.
  it("threads the `table` arg without changing default behavior when no override is registered", () => {
    expect(canonicalizeRailsRow({ pirate: "x" }, { pirate_id: 1 }, null, "some_table")).toEqual({
      pirate_id: "x",
    });
  });
  it("preserves polymorphic `name (Type)` split on the convention path", () => {
    // Rails fixtures.rb#replace_belongs_to_keys emits both <col> and
    // <assoc>_type for polymorphic associations. The shared parser keeps
    // that behavior on the standard `<assoc>_id` path.
    const cols = new Set(["pirate_id", "pirate_type"]);
    expect(canonicalizeRailsRow({ pirate: "blackbeard (Pirate)" }, {}, cols)).toEqual({
      pirate_id: "blackbeard",
      pirate_type: "Pirate",
    });
  });
});

// ---- models pass unit tests ----

const emptyClass = (): RubyClass => ({
  name: "Foo",
  parent: "ActiveRecord::Base",
  tableName: null,
  associations: [],
  validations: [],
  scopes: [],
  callbacks: [],
  attributes: [],
});

describe("tsModelPath", () => {
  it("converts underscores to hyphens and maps to models dir", () => {
    expect(tsModelPath("test/models/book_destroy_async.rb")).toMatch(/book-destroy-async\.ts$/);
  });
  it("preserves subdirectory structure", () => {
    expect(tsModelPath("test/models/admin/account.rb")).toMatch(/admin[/\\]account\.ts$/);
  });
});

describe("compareModelClass", () => {
  it("returns MATCH when all associations are found", () => {
    const ruby: RubyClass = {
      ...emptyClass(),
      associations: [{ kind: "has_many", name: "comments", options: {} }],
    };
    const ts = `static { this.hasMany("comments", {}); }`;
    const r = compareModelClass(ruby, ts, "test/models/foo.rb", "foo.ts");
    expect(r.status).toBe("MATCH");
    expect(r.assocMatched).toBe(1);
    expect(r.notes).toHaveLength(0);
  });

  it("returns DIFF and notes when an association is absent", () => {
    const ruby: RubyClass = {
      ...emptyClass(),
      associations: [{ kind: "belongs_to", name: "author", options: {} }],
    };
    const r = compareModelClass(ruby, "// empty", "test/models/foo.rb", "foo.ts");
    expect(r.status).toBe("DIFF");
    expect(r.assocMatched).toBe(0);
    expect(r.notes[0]).toMatch(/assoc-missing/);
  });

  it("does not false-positive on bare string containing scope name", () => {
    // "open" appears in a comment; should NOT count as a matched scope
    const ruby: RubyClass = {
      ...emptyClass(),
      scopes: [{ name: "open" }],
    };
    const ts = `// we leave connections open`;
    const r = compareModelClass(ruby, ts, "test/models/foo.rb", "foo.ts");
    expect(r.status).toBe("DIFF");
    expect(r.scopesMatched).toBe(0);
  });

  it("matches scope when this.scope call is present", () => {
    const ruby: RubyClass = { ...emptyClass(), scopes: [{ name: "published" }] };
    const ts = `this.scope("published", () => this.where({ published: true }));`;
    const r = compareModelClass(ruby, ts, "test/models/foo.rb", "foo.ts");
    expect(r.scopesMatched).toBe(1);
  });

  it("matches validates but not validate (no false positive)", () => {
    const ruby: RubyClass = {
      ...emptyClass(),
      validations: [{ kind: "validates", attributes: ["name"], options: {} }],
    };
    // validate( without s — should NOT match validates check
    const ts = `this.validate("name is too short");`;
    const r = compareModelClass(ruby, ts, "test/models/foo.rb", "foo.ts");
    expect(r.valsMatched).toBe(0);
    expect(r.status).toBe("DIFF");
  });

  it("matches validates_presence_of to validatesPresenceOf shorthand", () => {
    const ruby: RubyClass = {
      ...emptyClass(),
      validations: [{ kind: "validates_presence_of", attributes: ["title"], options: {} }],
    };
    const ts = `this.validatesPresenceOf("title");`;
    const r = compareModelClass(ruby, ts, "test/models/foo.rb", "foo.ts");
    expect(r.valsMatched).toBe(1);
    expect(r.status).toBe("MATCH");
  });

  it("also accepts generic validates() for validates_presence_of (fallback)", () => {
    const ruby: RubyClass = {
      ...emptyClass(),
      validations: [{ kind: "validates_presence_of", attributes: ["title"], options: {} }],
    };
    const ts = `this.validates("title", { presence: true });`;
    const r = compareModelClass(ruby, ts, "test/models/foo.rb", "foo.ts");
    expect(r.valsMatched).toBe(1);
  });

  it("matches validates_uniqueness_of to validatesUniqueness (no 'Of')", () => {
    const ruby: RubyClass = {
      ...emptyClass(),
      validations: [{ kind: "validates_uniqueness_of", attributes: ["email"], options: {} }],
    };
    expect(
      compareModelClass(ruby, `this.validatesUniqueness("email");`, "test/models/foo.rb", "foo.ts")
        .valsMatched,
    ).toBe(1);
    // Must NOT match the wrong name
    expect(
      compareModelClass(
        ruby,
        `this.validatesUniquenessOf("email");`,
        "test/models/foo.rb",
        "foo.ts",
      ).valsMatched,
    ).toBe(0);
  });
});
