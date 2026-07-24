import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAG_REASON,
  parseJsdoc,
  reconcile,
  reconcileFileText,
  renderJsdoc,
} from "./build.js";

const reasonFor = () => DEFAULT_TAG_REASON;

describe("parseJsdoc", () => {
  it("parses tags with continuation lines and keeps other prose", () => {
    const comment = [
      "/**",
      " * Mirrors Rails `Base.all`.",
      " *",
      " * @missingRailsCall default_scoped — Baseline (RFC 0047): wide call-set",
      " *   flag seeded when the wide ratchet landed.",
      " * @missingRailsCall merge! — Confirmed equivalent.",
      " */",
    ].join("\n");
    const { rest, entries } = parseJsdoc(comment);
    expect(entries.map((e) => e.call)).toEqual(["default_scoped", "merge!"]);
    expect(entries[0]!.reason).toBe(
      "Baseline (RFC 0047): wide call-set flag seeded when the wide ratchet landed.",
    );
    expect(entries[0]!.rawLines).toHaveLength(2);
    expect(rest.join("\n")).toContain("Mirrors Rails");
    expect(rest.join("\n")).not.toContain("@missingRailsCall");
  });
});

describe("reconcile", () => {
  it("keeps still-missing, adds new, drops satisfied", () => {
    const { entries } = parseJsdoc("/**\n * @missingRailsCall a — kept note\n */");
    const r = reconcile(entries, new Set(["a", "b"]), reasonFor);
    expect(r.kept.map((e) => e.call)).toEqual(["a"]);
    expect(r.kept[0]!.reason).toBe("kept note");
    expect(r.added.map((e) => e.call)).toEqual(["b"]);
    expect(r.dropped).toEqual([]);
    const r2 = reconcile(entries, new Set(), reasonFor);
    expect(r2.dropped.map((e) => e.call)).toEqual(["a"]);
  });
});

describe("renderJsdoc", () => {
  it("returns null for a tags-only comment with no remaining entries", () => {
    const { rest } = parseJsdoc("/**\n * @missingRailsCall a — x\n */");
    expect(renderJsdoc(rest, [], "  ")).toBeNull();
  });
});

const FILE = [
  "export class Foo {",
  "  /**",
  "   * Mirrors Rails `Foo#bar`.",
  "   *",
  "   * @missingRailsCall stale_call — placeholder to drop",
  "   */",
  "  bar(): void {}",
  "",
  "  baz(): void {}",
  "}",
].join("\n");

describe("reconcileFileText", () => {
  it("reconciles: drops satisfied tags, adds tags, creates missing JSDoc", () => {
    const expectations = new Map([
      ["bar", { rubyName: "bar", calls: new Set(["save"]) }],
      ["baz", { rubyName: "baz", calls: new Set(["reload"]) }],
    ]);
    const { text, harvested } = reconcileFileText("foo.ts", FILE, expectations, () => "why");
    expect(text).not.toBeNull();
    expect(text!).not.toContain("stale_call");
    expect(text!).toContain("@missingRailsCall save — why");
    expect(text!).toContain("@missingRailsCall reload — why");
    expect(text!).toContain("Mirrors Rails `Foo#bar`.");
    // Bodies untouched.
    expect(text!).toContain("bar(): void {}");
    expect(text!).toContain("baz(): void {}");
    expect(harvested.map((h) => h.entry.call)).toEqual(["stale_call"]);
  });

  it("is idempotent: a second run produces zero edits", () => {
    const expectations = new Map([
      ["bar", { rubyName: "bar", calls: new Set(["save"]) }],
      ["baz", { rubyName: "baz", calls: new Set(["reload"]) }],
    ]);
    const first = reconcileFileText("foo.ts", FILE, expectations, () => "why").text!;
    const second = reconcileFileText("foo.ts", first, expectations, () => "why");
    expect(second.text).toBeNull();
  });

  it("reconciles set accessors (extract-ts-api extracts them into the artifact)", () => {
    const src = ["export class Foo {", "  set name(v: string) {}", "}"].join("\n");
    const expectations = new Map([
      ["name", { rubyName: "name=", calls: new Set(["write_attribute"]) }],
    ]);
    const { text } = reconcileFileText("foo.ts", src, expectations, () => "why");
    expect(text!).toContain("@missingRailsCall write_attribute — why");
  });

  it("removes a tags-only JSDoc entirely once all calls converge", () => {
    const src = [
      "export class Foo {",
      "  /**",
      "   * @missingRailsCall gone — note",
      "   */",
      "  bar(): void {}",
      "}",
    ].join("\n");
    const { text } = reconcileFileText("foo.ts", src, new Map(), () => "x");
    expect(text!).not.toContain("@missingRailsCall");
    expect(text!).not.toContain("/**");
    expect(text!).toContain("  bar(): void {}");
  });
});
