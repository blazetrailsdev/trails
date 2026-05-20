import { describe, it, expect } from "vitest";
import { stripErb, isRefLike, compareValue, compareFile } from "./compare.js";

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
