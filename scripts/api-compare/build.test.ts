import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ANY_CLASS,
  type MethodExpectation,
  DEFAULT_TAG_REASON,
  expectationKey,
  parseJsdoc,
  reconcile,
  reconcileFileText,
  renderJsdoc,
  buildExpectations,
  fileModuleName,
  groupByDeclFile,
  lowerMarksForDropped,
  migrationSummary,
  scopedRows,
  staleTagKey,
  argReasons,
  buildArgExpectations,
  justifiesArgs,
} from "./build.js";
import type { CallArgArtifact } from "./call-args-baseline.js";
import { TAG as ARGS_TAG } from "./missing-rails-args-tags.js";
import { serializeBaseline } from "./baseline-json.js";
import { keyOf } from "./call-mismatch-baseline.js";
import { NARROW_DEFAULT_REASON } from "./missing-rails-call-tags.js";

/** One expectation under {@link ANY_CLASS} — the key a `tsClass`-less artifact
 *  row produces, which reconciles every declaration of the name in the file. */
const anyClass = (
  tsName: string,
  rubyNames: string[],
  calls: Set<string>,
): [string, MethodExpectation] => [expectationKey(ANY_CLASS, tsName), { rubyNames, tsName, calls }];

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
    expect(entries[0].reason).toBe(
      "Baseline (RFC 0047): wide call-set flag seeded when the wide ratchet landed.",
    );
    expect(entries[0].rawLines).toHaveLength(2);
    expect(rest.join("\n")).toContain("Mirrors Rails");
    expect(rest.join("\n")).not.toContain("@missingRailsCall");
  });

  it("rejects a bare tag with a file:line message", () => {
    const comment = [
      "/**",
      " * Mirrors Rails `Base.all`.",
      " * @missingRailsCall merge!",
      " */",
    ].join("\n");
    expect(() => parseJsdoc(comment, { fileName: "foo.ts", startLine: 10 })).toThrow(
      /@missingRailsCall needs a reason: foo\.ts:12 — state why the Rails call `merge!`/,
    );
  });

  it("rejects a tag whose em-dash carries no prose, with no location when unknown", () => {
    expect(() => parseJsdoc("/**\n * @missingRailsCall merge! — \n */")).toThrow(
      "@missingRailsCall needs a reason: — state why the Rails call `merge!` is not made here.",
    );
  });

  it("rejects a reason that is only whitespace after the em-dash", () => {
    expect(() => parseJsdoc("/**\n * @missingRailsCall merge! —   \n */")).toThrow(
      "@missingRailsCall needs a reason",
    );
  });

  it("accepts the generator's placeholder reason", () => {
    const { entries } = parseJsdoc(`/**\n * @missingRailsCall a — ${DEFAULT_TAG_REASON}\n */`);
    expect(entries[0].reason).toBe(DEFAULT_TAG_REASON);
  });
});

describe("reconcile", () => {
  it("keeps still-missing, adds new, drops satisfied", () => {
    const { entries } = parseJsdoc("/**\n * @missingRailsCall a — kept note\n */");
    const r = reconcile(entries, new Set(["a", "b"]), () => "curated");
    expect(r.kept.map((e) => e.call)).toEqual(["a"]);
    expect(r.kept[0].reason).toBe("kept note");
    expect(r.added.map((e) => e.call)).toEqual(["b"]);
    expect(r.dropped).toEqual([]);
    const r2 = reconcile(entries, new Set(), reasonFor);
    expect(r2.dropped.map((e) => e.call)).toEqual(["a"]);
  });

  it("mints no tag when the curated reason is blank", () => {
    const r = reconcile([], new Set(["a"]), () => "  ");
    expect(r.added).toEqual([]);
    expect(r.skipped).toEqual(["a"]);
  });

  it("mints no tag when the baseline reason is still the placeholder", () => {
    const r = reconcile([], new Set(["a"]), reasonFor);
    expect(r.added).toEqual([]);
    expect(r.skipped).toEqual(["a"]);
  });

  it("mints only the calls onlyCall names, and still keeps and drops the rest", () => {
    const { entries } = parseJsdoc("/**\n * @missingRailsCall a — kept note\n */");
    const r = reconcile(entries, new Set(["a", "b", "c"]), () => "curated", new Set(["b"]));
    expect(r.added.map((e) => e.call)).toEqual(["b"]);
    expect(r.skipped).toEqual(["c"]);
    expect(r.kept.map((e) => e.call)).toEqual(["a"]);
    const r2 = reconcile(entries, new Set(), () => "curated", new Set(["b"]));
    expect(r2.dropped.map((e) => e.call)).toEqual(["a"]);
  });

  it("keeps a pre-existing placeholder tag rather than rewriting it", () => {
    const { entries } = parseJsdoc(`/**\n * @missingRailsCall a — ${DEFAULT_TAG_REASON}\n */`);
    const r = reconcile(entries, new Set(["a"]), reasonFor);
    expect(r.kept.map((e) => e.call)).toEqual(["a"]);
    expect(r.skipped).toEqual([]);
  });
});

describe("renderJsdoc", () => {
  it("returns null for a tags-only comment with no remaining entries", () => {
    const { rest } = parseJsdoc("/**\n * @missingRailsCall a — x\n */");
    expect(renderJsdoc(rest, [], "  ")).toBeNull();
  });

  it("keeps a one-line doc comment verbatim when there are no entries", () => {
    const one = "  /** Mirrors Rails' Dot#edge — push edge, run block, pop. */";
    expect(renderJsdoc([one], [], "  ")).toBe(one);
  });

  it("returns null for an empty one-line comment with no entries", () => {
    expect(renderJsdoc(["  /** */"], [], "  ")).toBeNull();
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
  /** One expectation under a named owner — the key an artifact row with a
   *  `tsClass` produces. */
  const owned = (
    tsClass: string,
    tsName: string,
    calls: Set<string>,
  ): [string, MethodExpectation] => [
    expectationKey(tsClass, tsName),
    { rubyNames: [tsName], tsName, calls },
  ];

  it("mints a tag on a top-level function keyed under the synthesized file module", () => {
    // extract-ts-api.ts records a file's top-level functions under a module it
    // synthesizes from the FILE NAME, so compare.ts keys `quoteString` under
    // `Quoting` while the AST reports no enclosing class at all.
    const src = ["export function quoteString(v: string): string {", "  return v;", "}"].join("\n");
    const expectations = new Map([owned("Quoting", "quoteString", new Set(["quote"]))]);
    const r = reconcileFileText(
      "quoting.ts",
      src,
      expectations,
      () => "PERMANENT: no driver quote",
    );
    expect(r.unmatched).toEqual([]);
    expect(r.text!).toContain("@missingRailsCall quote — PERMANENT: no driver quote");
    expect(r.tagged).toEqual([{ rubyName: "quoteString", call: "quote" }]);
  });

  it("mints a tag on a method inside a mixin object literal", () => {
    const src = ["export const ThroughAssociation = {", "  targetScope(): void {}", "};"].join(
      "\n",
    );
    const expectations = new Map([owned("ThroughAssociation", "targetScope", new Set(["drop"]))]);
    const r = reconcileFileText("through-association.ts", src, expectations, () => "PERMANENT: x");
    expect(r.unmatched).toEqual([]);
    expect(r.text!).toContain("@missingRailsCall drop — PERMANENT: x");
  });

  it("mints a tag on an arrow-function property", () => {
    const src = [
      "export class Foo {",
      "  bar = (): void => {};",
      "}",
      "export const helpers = { baz: () => {} };",
    ].join("\n");
    const expectations = new Map([
      owned("Foo", "bar", new Set(["save"])),
      owned("helpers", "baz", new Set(["reload"])),
    ]);
    const r = reconcileFileText("foo.ts", src, expectations, () => "PERMANENT: x");
    expect(r.unmatched).toEqual([]);
    expect(r.text!).toContain("@missingRailsCall save — PERMANENT: x");
    expect(r.text!).toContain("@missingRailsCall reload — PERMANENT: x");
  });

  it("is idempotent on the newly-supported declaration forms", () => {
    const src = [
      "export const ThroughAssociation = {",
      "  targetScope(): void {}",
      "};",
      "export function quoteString(v: string): string {",
      "  return v;",
      "}",
    ].join("\n");
    const expectations = new Map([
      owned("ThroughAssociation", "targetScope", new Set(["drop"])),
      owned("Quoting", "quoteString", new Set(["quote"])),
    ]);
    const reason = () => "PERMANENT: x";
    const first = reconcileFileText("quoting.ts", src, expectations, reason).text!;
    expect(reconcileFileText("quoting.ts", first, expectations, reason).text).toBeNull();
  });

  it("leaves a mixed-family comment alone in either kind", () => {
    // Observed on `encryption/cipher/aes256-gcm.ts` `encrypt`: 0 rows migrated,
    // 1 file rewritten (RFC 0106).
    const src = [
      "export class Foo {",
      "  /**",
      "   * @missingRailsCall generate_iv — PERMANENT: the IV is a constructor",
      "   *   argument in Node, so the two calls necessarily swap order.",
      "   *",
      "   * Ruby's `clear_text` is a byte String, whose JS pair is a Buffer.",
      "   *",
      "   * @missingRailsArgs generate_iv — PERMANENT: no cipher object exists at",
      "   *   that point.",
      "   *",
      "   * The `authTagLength` option carries what Rails reads off the receiver.",
      "   */",
      "  bar(): void {}",
      "}",
    ].join("\n");
    const calls = new Map([anyClass("bar", ["bar"], new Set(["generate_iv"]))]);
    const reason = () => "PERMANENT: x";
    expect(reconcileFileText("foo.ts", src, calls, reason).text).toBeNull();
    expect(
      reconcileFileText("foo.ts", src, calls, reason, undefined, undefined, ARGS_TAG).text,
    ).toBeNull();
  });

  it("leaves a same-family comment split by prose alone in either kind", () => {
    // The single `slot` #6958 added is taken at the FIRST tag of the family, so
    // a second receipt further down was hoisted up next to it — 0 rows
    // migrated, 1 file rewritten (RFC 0106).
    const src = [
      "export class Foo {",
      "  /**",
      "   * @missingRailsCall alpha — PERMANENT: the first receipt.",
      "   *",
      "   * Prose sitting between two receipts of the SAME family.",
      "   *",
      "   * @missingRailsCall beta — PERMANENT: the second receipt.",
      "   */",
      "  bar(): void {}",
      "}",
    ].join("\n");
    const calls = new Map([anyClass("bar", ["bar"], new Set(["alpha", "beta"]))]);
    const reason = () => "PERMANENT: x";
    expect(reconcileFileText("foo.ts", src, calls, reason).text).toBeNull();
    const args = src.replace(/@missingRailsCall/g, "@missingRailsArgs");
    expect(
      reconcileFileText("foo.ts", args, calls, reason, undefined, undefined, ARGS_TAG).text,
    ).toBeNull();
  });

  it("lets a class of the file-module's name keep its own key", () => {
    // `relation.ts` declares `class Relation`, whose name IS the synthesized
    // file-module name: a top-level function of the same name must not claim
    // the class's expectation.
    const src = [
      "export class Relation {",
      "  toSql(): string {",
      '    return "";',
      "  }",
      "}",
      "export function toSql(): string {",
      '  return "";',
      "}",
    ].join("\n");
    const expectations = new Map([owned("Relation", "toSql", new Set(["arel"]))]);
    const r = reconcileFileText("relation.ts", src, expectations, () => "PERMANENT: x");
    const lines = r.text!.split("\n");
    // The tag lands above the CLASS method, not the top-level function.
    expect(lines.findIndex((l) => l.includes("@missingRailsCall arel"))).toBeLessThan(
      lines.findIndex((l) => l.includes("export function toSql")),
    );
    expect(r.text!.match(/@missingRailsCall/g)).toHaveLength(1);
  });

  it("reconciles: drops satisfied tags, adds tags, creates missing JSDoc", () => {
    const expectations = new Map([
      anyClass("bar", ["bar"], new Set(["save"])),
      anyClass("baz", ["baz"], new Set(["reload"])),
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

  it("produces zero edits when every missing call is still baselined by placeholder", () => {
    const src = ["export class Foo {", "  bar(): void {}", "}"].join("\n");
    const expectations = new Map([anyClass("bar", ["bar"], new Set(["save"]))]);
    const r = reconcileFileText("foo.ts", src, expectations, () => DEFAULT_TAG_REASON);
    expect(r.text).toBeNull();
    expect(r.skipped).toEqual(["save"]);
    expect(r.tagged).toEqual([]);
  });

  it("never deletes a one-line doc comment on a method it mints no tag for", () => {
    const src = [
      "export class Foo {",
      "  /** Mirrors Rails' Foo#bar. */",
      "  bar(): void {}",
      "}",
    ].join("\n");
    const expectations = new Map([anyClass("bar", ["bar"], new Set(["save"]))]);
    const r = reconcileFileText("foo.ts", src, expectations, () => DEFAULT_TAG_REASON);
    expect(r.text).toBeNull();
  });

  it("still harvests a human-authored reason when its call converges", () => {
    // `bar` HAS an expectation, for a different call: the artifact knows the
    // declaration, so `stale_call` genuinely no longer fires.
    const expectations = new Map([anyClass("bar", ["bar"], new Set(["save"]))]);
    const r = reconcileFileText("foo.ts", FILE, expectations, () => DEFAULT_TAG_REASON);
    expect(r.harvested.map((h) => h.entry.reason)).toEqual(["placeholder to drop"]);
    expect(r.inert).toEqual([]);
  });

  it("reports a pre-existing tag on a declaration the artifact knows nothing about as inert", () => {
    // The PR #6873 loss: migrating one method's rows rewrote the JSDoc of every
    // declaration in the file, and a reviewed receipt on an unrelated one — with
    // no baseline row anywhere to put it back — was deleted on a `harvested`
    // line that read like a successful migration.
    const src = [
      "export class Foo {",
      "  /**",
      "   * Mirrors Rails `Foo#bar`.",
      "   */",
      "  bar(): void {}",
      "",
      "  /**",
      "   * @missingRailsCall with_raw_connection — PERMANENT: escapes inline.",
      "   */",
      "  quoteString(): void {}",
      "}",
    ].join("\n");
    const expectations = new Map([owned("Foo", "bar", new Set(["save"]))]);
    const r = reconcileFileText("foo.ts", src, expectations, () => "PERMANENT: x");
    expect(r.text!).toContain("@missingRailsCall save — PERMANENT: x");
    expect(r.text!).toContain("@missingRailsCall with_raw_connection — PERMANENT: escapes inline.");
    expect(r.harvested).toEqual([]);
    expect(r.inert.map((p) => [p.tsName, p.entry.call])).toEqual([
      ["quoteString", "with_raw_connection"],
    ]);
    // And a second run over the result is still a no-op.
    expect(
      reconcileFileText("foo.ts", r.text!, expectations, () => "PERMANENT: x").text,
    ).toBeNull();
  });

  it("names the file:line an inert tag is written on", () => {
    // The INERT report has to name a site the operator can open: the tag is on
    // a declaration with no Rails counterpart, so nothing else in the run
    // points at it (RFC 0106).
    const src = [
      "export class Foo {",
      "  /**",
      "   * Mirrors Rails `Foo#bar`.",
      "   */",
      "  bar(): void {}",
      "",
      "  /**",
      "   * @missingRailsCall with_raw_connection — PERMANENT: escapes inline.",
      "   */",
      "  _quoteStringTs(): void {}",
      "}",
    ].join("\n");
    const expectations = new Map([owned("Foo", "bar", new Set(["save"]))]);
    const r = reconcileFileText("foo.ts", src, expectations, () => "PERMANENT: x");
    expect(r.inert.map((p) => [p.tsName, p.entry.line])).toEqual([["_quoteStringTs", 8]]);
  });

  it("retires a tag compare.ts reports stale, and only that one", () => {
    // The other half of the #6873 fix: with no expectation the run preserves,
    // but compare.ts's `staleCallTags` is positive knowledge that the call is
    // no longer flagged there — that tag goes, its neighbour stays.
    const src = [
      "export class Foo {",
      "  /**",
      "   * @missingRailsCall logger — PERMANENT: no logger yet.",
      "   */",
      "  bar(): void {}",
      "",
      "  /**",
      "   * @missingRailsCall with_raw_connection — PERMANENT: escapes inline.",
      "   */",
      "  quoteString(): void {}",
      "}",
    ].join("\n");
    const r = reconcileFileText(
      "foo.ts",
      src,
      new Map(),
      () => "PERMANENT: x",
      undefined,
      new Set([staleTagKey("Foo", "bar", "logger")]),
    );
    expect(r.text!).not.toContain("@missingRailsCall logger");
    expect(r.text!).toContain("@missingRailsCall with_raw_connection — PERMANENT: escapes inline.");
    expect(r.harvested.map((h) => [h.tsName, h.entry.call])).toEqual([["bar", "logger"]]);
    expect(r.inert.map((p) => [p.tsName, p.entry.call])).toEqual([
      ["quoteString", "with_raw_connection"],
    ]);
  });

  it("does not retire a same-named sibling declaration's tag", () => {
    // Two declarations of one name reachable from a single row-file: the
    // stale key must name the OWNING class, or retiring `Store#bar` deletes
    // the top-level `bar`'s reviewed receipt (RFC 0106).
    const src = [
      "export class Store {",
      "  /**",
      "   * @missingRailsCall logger — PERMANENT: no logger yet.",
      "   */",
      "  bar(): void {}",
      "}",
      "",
      "/**",
      " * @missingRailsCall logger — PERMANENT: reviewed elsewhere.",
      " */",
      "export function bar(): void {}",
    ].join("\n");
    const r = reconcileFileText(
      "foo.ts",
      src,
      new Map(),
      () => "PERMANENT: x",
      undefined,
      new Set([staleTagKey("Store", "bar", "logger")]),
    );
    expect(r.text!).toContain("@missingRailsCall logger — PERMANENT: reviewed elsewhere.");
    expect(r.text!).not.toContain("@missingRailsCall logger — PERMANENT: no logger yet.");
    expect(r.harvested.map((h) => [h.tsName, h.entry.call])).toEqual([["bar", "logger"]]);
    expect(r.inert.map((p) => [p.tsName, p.entry.call])).toEqual([["bar", "logger"]]);
  });

  it("is idempotent: a second run produces zero edits", () => {
    const expectations = new Map([
      anyClass("bar", ["bar"], new Set(["save"])),
      anyClass("baz", ["baz"], new Set(["reload"])),
    ]);
    const first = reconcileFileText("foo.ts", FILE, expectations, () => "why").text!;
    const second = reconcileFileText("foo.ts", first, expectations, () => "why");
    expect(second.text).toBeNull();
  });

  it("reconciles set accessors (extract-ts-api extracts them into the artifact)", () => {
    const src = ["export class Foo {", "  set name(v: string) {}", "}"].join("\n");
    const expectations = new Map([anyClass("name", ["name="], new Set(["write_attribute"]))]);
    const { text } = reconcileFileText("foo.ts", src, expectations, () => "why");
    expect(text!).toContain("@missingRailsCall write_attribute — why");
  });

  it("round-trips a reason containing a Ruby ivar (@primary_key) across wraps", () => {
    const src = ["export class Foo {", "  bar(): void {}", "}"].join("\n");
    // Long enough that the wrapper would break right before the ivar word.
    const reason =
      "Per-entry verified (RFC 0032): Rails core.rb caches `klass.primary_key` into " +
      "@primary_key and calls `klass.define_attribute_methods`; neither call appears here.";
    const expectations = new Map([anyClass("bar", ["bar"], new Set(["primary_key"]))]);
    const first = reconcileFileText("foo.ts", src, expectations, () => reason).text!;
    const second = reconcileFileText("foo.ts", first, expectations, () => reason);
    expect(second.text).toBeNull();
    const { entries } = parseJsdoc(first);
    expect(entries).toHaveLength(1);
    expect(entries[0].reason).toContain("@primary_key and calls");
  });

  it("tags constructors (Ruby initialize) and reports unmatched expectations", () => {
    const src = ["export class Foo {", "  constructor() {}", "}"].join("\n");
    const expectations = new Map([
      anyClass("constructor", ["initialize"], new Set(["super"])),
      anyClass("prototypePatched", ["patched"], new Set(["save"])),
    ]);
    const { text, unmatched } = reconcileFileText("foo.ts", src, expectations, () => "why");
    expect(text!).toContain("@missingRailsCall super — why");
    expect(unmatched).toEqual(["prototypePatched"]);
  });

  it("stamps only the overload implementation, never the signatures", () => {
    const src = [
      "export function f(a: string): void;",
      "export function f(a: number): void;",
      "export function f(a: unknown): void {}",
    ].join("\n");
    const expectations = new Map([
      [expectationKey(ANY_CLASS, "f"), { rubyNames: ["f"], tsName: "f", calls: new Set(["save"]) }],
    ]);
    const { text } = reconcileFileText("foo.ts", src, expectations, () => "why");
    expect(text!.match(/@missingRailsCall save/g)).toHaveLength(1);
    expect(text!.indexOf("@missingRailsCall")).toBeGreaterThan(text!.indexOf("f(a: number)"));
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
    // An expectation with an EMPTY call set: the artifact knows the
    // declaration and flags nothing on it, so the tag has genuinely converged.
    const expectations = new Map([owned("Foo", "bar", new Set<string>())]);
    const { text } = reconcileFileText("foo.ts", src, expectations, () => "x");
    expect(text!).not.toContain("@missingRailsCall");
    expect(text!).not.toContain("/**");
    expect(text!).toContain("  bar(): void {}");
  });

  it("rejects a hand-authored bare tag, naming the tag's own line", () => {
    const src = [
      "export class Foo {",
      "  /**",
      "   * @missingRailsCall bare_call",
      "   */",
      "  bar(): void {}",
      "}",
    ].join("\n");
    expect(() => reconcileFileText("foo.ts", src, new Map(), () => "x")).toThrow(
      /@missingRailsCall needs a reason: foo\.ts:3 —/,
    );
  });
});

describe("reconcileFileText baseline migration", () => {
  it("reports every justified (rubyName, call) so the baseline row can be dropped", () => {
    const expectations = new Map([
      anyClass("bar", ["bar"], new Set(["save"])),
      anyClass("baz", ["baz"], new Set(["reload"])),
    ]);
    const { tagged } = reconcileFileText("foo.ts", FILE, expectations, () => "why");
    expect(tagged).toEqual([
      { rubyName: "bar", call: "save" },
      { rubyName: "baz", call: "reload" },
    ]);
  });

  it("reports a KEPT tag too — an already-tagged call owes no baseline row", () => {
    const expectations = new Map([anyClass("bar", ["bar"], new Set(["save"]))]);
    const first = reconcileFileText("foo.ts", FILE, expectations, () => "why").text!;
    const { tagged } = reconcileFileText("foo.ts", first, expectations, () => "why");
    expect(tagged).toEqual([{ rubyName: "bar", call: "save" }]);
  });
});

describe("class-qualified expectations", () => {
  // Two same-named methods in one file, as `connection-pool.ts` has:
  // Rails' NullPool takes no mutex and defines no `checkout` at all
  // (connection_adapters/abstract/connection_pool.rb:14-42), so only
  // ConnectionPool's copy is the artifact's match.
  const src = [
    "export class ConnectionPool {",
    "  checkout(): void {}",
    "}",
    "",
    "export class NullPool {",
    "  checkout(): void {}",
    "}",
  ].join("\n");
  const artifact = {
    packages: ["activerecord"],
    mismatches: [
      {
        package: "activerecord",
        tsFile: "connection-pool.ts",
        rubyName: "checkout",
        tsName: "checkout",
        tsClass: "ConnectionPool",
        missing: ["synchronize → synchronize"],
      },
    ],
  };

  it("mints the tag only on the class the artifact matched", () => {
    const expectations = buildExpectations(artifact, "activerecord").get("connection-pool.ts")!;
    const { text } = reconcileFileText("connection-pool.ts", src, expectations, () => "why");
    expect(text).not.toBeNull();
    expect(text!.match(/@missingRailsCall synchronize/g)).toHaveLength(1);
    expect(text!).toContain(
      ["export class ConnectionPool {", "  /**", "   * @missingRailsCall synchronize — why"].join(
        "\n",
      ),
    );
    expect(text!).toContain(["export class NullPool {", "  checkout(): void {}"].join("\n"));
  });

  it("reconciles every declaration of the name when the artifact resolved no class", () => {
    const unqualified = {
      ...artifact,
      mismatches: [{ ...artifact.mismatches[0], tsClass: undefined }],
    };
    const expectations = buildExpectations(unqualified, "activerecord").get("connection-pool.ts")!;
    const { text } = reconcileFileText("connection-pool.ts", src, expectations, () => "why");
    expect(text!.match(/@missingRailsCall synchronize/g)).toHaveLength(2);
  });
});

describe("buildExpectations", () => {
  const artifact = {
    packages: ["arel"],
    mismatches: [
      {
        package: "arel",
        tsFile: "insert-manager.ts",
        rubyName: "insert",
        tsName: "insert",
        missing: ["each → forEach"],
      },
      { package: "other", tsFile: "x.ts", rubyName: "x", tsName: "x", missing: ["save → save"] },
    ],
    suppressed: [
      {
        package: "arel",
        tsFile: "insert-manager.ts",
        rubyName: "insert",
        tsName: "insert",
        call: "first",
      },
    ],
  };

  it("keeps a suppressed call expected, so the tag that earned it survives", () => {
    const calls = buildExpectations(artifact, "arel")
      .get("insert-manager.ts")!
      .get(expectationKey(ANY_CLASS, "insert"))!.calls;
    expect([...calls].sort()).toEqual(["each", "first"]);
  });

  it("ignores other packages and honours the --file filter", () => {
    expect(buildExpectations(artifact, "other").has("insert-manager.ts")).toBe(false);
    expect(buildExpectations(artifact, "arel", "elsewhere.ts").size).toBe(0);
  });

  it("leaves a placeholder-reasoned row in the baseline — it justifies nothing", () => {
    const expectations = new Map([anyClass("bar", ["bar"], new Set(["save"]))]);
    const { tagged } = reconcileFileText("foo.ts", FILE, expectations, () => DEFAULT_TAG_REASON);
    expect(tagged).toEqual([]);
  });

  it("mints no tag for a narrow-seeded row either, matching the wide policy", () => {
    const expectations = new Map([anyClass("bar", ["bar"], new Set(["save"]))]);
    const { text, tagged, skipped } = reconcileFileText(
      "foo.ts",
      FILE,
      expectations,
      () => NARROW_DEFAULT_REASON,
    );
    expect(tagged).toEqual([]);
    expect(skipped).toEqual(["save"]);
    expect(text ?? "").not.toContain(NARROW_DEFAULT_REASON);
  });

  it("records every Ruby name that lands on one TS method", () => {
    const twoNames = {
      packages: ["arel"],
      mismatches: [
        {
          package: "arel",
          tsFile: "insert-manager.ts",
          rubyName: "insert",
          tsName: "insert",
          missing: ["each → forEach"],
        },
        {
          package: "arel",
          tsFile: "insert-manager.ts",
          rubyName: "insert_all",
          tsName: "insert",
          missing: ["first → first"],
        },
      ],
    };
    const exp = buildExpectations(twoNames, "arel")
      .get("insert-manager.ts")!
      .get(expectationKey(ANY_CLASS, "insert"))!;
    expect(exp.rubyNames).toEqual(["insert", "insert_all"]);
  });
});

describe("buildExpectations / groupByDeclFile for a class split into a subdirectory", () => {
  // `cache.rb`'s `Store` is ported to `cache/store.ts`, so the row keyed
  // `cache.ts` has to be tagged in the file the member is declared in.
  const artifact = {
    mismatches: [
      {
        package: "activesupport",
        tsFile: "cache.ts",
        rubyName: "merged_options",
        tsName: "mergedOptions",
        tsClass: "Store",
        tsDeclFile: "cache/store.ts",
        missing: ["merge → merge"],
      },
      {
        package: "activesupport",
        tsFile: "cache.ts",
        rubyName: "lookup_store",
        tsName: "lookupStore",
        missing: ["new → new"],
      },
    ],
  };

  it("routes each expectation to the file that declares it, keeping the row's key", () => {
    const expectations = buildExpectations(artifact, "activesupport").get("cache.ts")!;
    const groups = groupByDeclFile("cache.ts", expectations);
    expect([...groups.get("cache/store.ts")!.values()].map((e) => e.tsName)).toEqual([
      "mergedOptions",
    ]);
    expect([...groups.get("cache.ts")!.values()].map((e) => e.tsName)).toEqual(["lookupStore"]);
  });

  it("always groups the row's own file, so a stale-tag-only run still opens it", () => {
    expect([...groupByDeclFile("cache.ts", new Map()).keys()]).toEqual(["cache.ts"]);
  });

  it("groups a declaring file named only by a stale tag, so its file is opened too", () => {
    // A stale-only run over a split declaration: no expectation reaches
    // `cache/store.ts`, so without the extra group the tag's own file is never
    // read and the stale tag survives.
    expect([...groupByDeclFile("cache.ts", new Map(), ["cache/store.ts"]).keys()].sort()).toEqual([
      "cache.ts",
      "cache/store.ts",
    ]);
  });
});

describe("reconcileFileText with two Ruby names on one TS method", () => {
  it("drops the baseline row of each Ruby name a justified tag covers", () => {
    const expectations = new Map([anyClass("bar", ["bar", "bar_all"], new Set(["save"]))]);
    const { tagged } = reconcileFileText("foo.ts", FILE, expectations, () => "why");
    expect(tagged).toEqual([
      { rubyName: "bar", call: "save" },
      { rubyName: "bar_all", call: "save" },
    ]);
  });

  it("seeds a new tag from whichever Ruby name has curated prose", () => {
    const expectations = new Map([anyClass("bar", ["bar", "bar_all"], new Set(["save"]))]);
    const { text } = reconcileFileText("foo.ts", FILE, expectations, (rubyName) =>
      rubyName === "bar_all" ? "curated" : DEFAULT_TAG_REASON,
    );
    expect(text!).toContain("@missingRailsCall save — curated");
  });
});

describe("lowerMarksForDropped", () => {
  const tmpDirs: string[] = [];
  async function tmpMarkDir(shards: Record<string, number>): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "api-build-marks-"));
    tmpDirs.push(dir);
    for (const [rel, max] of Object.entries(shards)) {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), serializeBaseline({ max }));
    }
    return dir;
  }
  afterAll(async () => {
    for (const dir of tmpDirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
  });

  const seeded = (tsFile: string, call: string) => ({
    package: "activerecord",
    tsFile,
    rubyName: "bar",
    call,
    reason: DEFAULT_TAG_REASON,
  });

  it("lowers only the shard of a source whose seeded rows were dropped", async () => {
    const dir = await tmpMarkDir({
      "activerecord/relation.json": 3,
      "activerecord/base.json": 2,
    });
    const { marks, moved } = await lowerMarksForDropped(
      dir,
      [seeded("relation.ts", "save")],
      [seeded("relation.ts", "merge!"), seeded("base.ts", "save")],
    );
    expect(moved).toEqual(["activerecord/relation.json"]);
    expect(marks.get("activerecord/relation.json")).toBe(1);
    expect(marks.get("activerecord/base.json")).toBe(2);
    expect(await fs.readFile(path.join(dir, "activerecord/base.json"), "utf-8")).toBe(
      serializeBaseline({ max: 2 }),
    );
  });

  it("deletes a shard whose source has no unreviewed rows left", async () => {
    const dir = await tmpMarkDir({ "activerecord/relation.json": 1 });
    const { marks } = await lowerMarksForDropped(dir, [seeded("relation.ts", "save")], []);
    expect(marks.has("activerecord/relation.json")).toBe(false);
    await expect(
      fs.readFile(path.join(dir, "activerecord/relation.json"), "utf-8"),
    ).rejects.toThrow(/ENOENT/);
  });

  it("writes nothing when the run dropped no rows", async () => {
    const dir = await tmpMarkDir({ "activerecord/relation.json": 3 });
    const before = await fs.stat(path.join(dir, "activerecord/relation.json"));
    const { marks } = await lowerMarksForDropped(dir, [], [seeded("relation.ts", "merge!")]);
    expect(marks.get("activerecord/relation.json")).toBe(3);
    expect((await fs.stat(path.join(dir, "activerecord/relation.json"))).mtimeMs).toBe(
      before.mtimeMs,
    );
  });

  it("never raises a mark that already sits below the remaining count", async () => {
    const dir = await tmpMarkDir({ "activerecord/relation.json": 1 });
    const { marks, moved } = await lowerMarksForDropped(
      dir,
      [seeded("relation.ts", "save")],
      [seeded("relation.ts", "merge!"), seeded("relation.ts", "reset")],
    );
    expect(moved).toEqual([]);
    expect(marks.get("activerecord/relation.json")).toBe(1);
  });
});

describe("fileModuleName", () => {
  it("PascalCases the file basename, as extract-ts-api.ts does", () => {
    expect(fileModuleName("aggregations.ts")).toBe("Aggregations");
    expect(fileModuleName("secure-password.ts")).toBe("SecurePassword");
    expect(fileModuleName("connection-adapters/sqlite3/quoting.ts")).toBe("Quoting");
  });
});

describe("migrationSummary", () => {
  const row = (kind: "calls" | "args", call: string) => ({
    package: "activesupport",
    tsFile: "encrypted-file.ts",
    rubyName: "encryptor",
    call,
    reason: DEFAULT_TAG_REASON,
    ...(kind === "args" ? { kind: "args" as const, rubyArgs: ["a"] } : {}),
  });

  it("names the args-kind rows a call-SET dry run leaves behind", () => {
    const lines = migrationSummary([row("args", "new"), row("args", "chomp")], 0, true);
    expect(lines[0]).toContain("0 of 2 baseline entr(ies) in scope would migrate");
    expect(lines[1]).toContain('2 of those row(s) are kind: "args"');
    expect(lines[1]).toContain("LIVE rows, not stale ones");
    expect(lines[1]).toContain("pnpm parity:api:calls:args");
  });

  it("says nothing extra when every row in scope is call-set kind", () => {
    expect(migrationSummary([row("calls", "new")], 1, false)).toHaveLength(1);
  });
});

describe("scopedRows", () => {
  const row = (pkg: string, tsFile: string, call = "new") => ({
    package: pkg,
    tsFile,
    rubyName: "encryptor",
    call,
    reason: DEFAULT_TAG_REASON,
  });

  it("keeps only the rows of the package and, when given, the file under build", () => {
    const baseline = [
      row("activesupport", "encrypted-file.ts"),
      row("activesupport", "message-encryptor.ts"),
      row("activerecord", "encrypted-file.ts"),
    ];
    expect(scopedRows(baseline, "activesupport")).toHaveLength(2);
    expect(scopedRows(baseline, "activesupport", "encrypted-file.ts")).toEqual([baseline[0]]);
  });

  it("narrows to the requested --call cluster so the summary counts only what ran", () => {
    const baseline = [
      row("activesupport", "encrypted-file.ts", "new"),
      row("activesupport", "encrypted-file.ts", "chomp"),
    ];
    expect(scopedRows(baseline, "activesupport", "encrypted-file.ts", new Set(["new"]))).toEqual([
      baseline[0],
    ]);
  });
});

describe("@missingRailsArgs receipts (--kind args)", () => {
  const src = ["export class Foo {", "  bar(): void {}", "}"].join("\n");
  const expectations = new Map([anyClass("bar", ["bar"], new Set(["freeze"]))]);

  it("mints a @missingRailsArgs tag from a curated args reason", () => {
    const r = reconcileFileText(
      "foo.ts",
      src,
      expectations,
      () => "PERMANENT: a JS Map has no initial_capacity",
      undefined,
      undefined,
      ARGS_TAG,
    );
    expect(r.text!).toContain(
      "@missingRailsArgs freeze — PERMANENT: a JS Map has no initial_capacity",
    );
    expect(r.text!).not.toContain("@missingRailsCall");
    expect(r.tagged).toEqual([{ rubyName: "bar", call: "freeze" }]);
  });

  it("is idempotent: a second pass over its own output produces no edit", () => {
    const reason = () => "PERMANENT: no thread pool to size";
    const first = reconcileFileText(
      "foo.ts",
      src,
      expectations,
      reason,
      undefined,
      undefined,
      ARGS_TAG,
    ).text!;
    expect(
      reconcileFileText("foo.ts", first, expectations, reason, undefined, undefined, ARGS_TAG).text,
    ).toBeNull();
  });

  it("mints nothing for a seeded placeholder reason, and reports it skipped", () => {
    const r = reconcileFileText(
      "foo.ts",
      src,
      expectations,
      () => DEFAULT_TAG_REASON,
      undefined,
      undefined,
      ARGS_TAG,
    );
    expect(r.text).toBeNull();
    expect(r.skipped).toEqual(["freeze"]);
    expect(r.tagged).toEqual([]);
  });

  it("retires a stale tag keyed under ANY_CLASS, as the args artifact records no class", () => {
    const tagged = [
      "export class Foo {",
      "  /** @missingRailsArgs freeze — PERMANENT: gone */",
      "  bar(): void {}",
      "}",
    ].join("\n");
    const r = reconcileFileText(
      "foo.ts",
      tagged,
      new Map(),
      () => "PERMANENT: x",
      undefined,
      new Set([staleTagKey(ANY_CLASS, "bar", "freeze")]),
      ARGS_TAG,
    );
    expect(r.text!).not.toContain(ARGS_TAG);
    expect(r.inert).toEqual([]);
  });

  it("justifiesArgs demands a permanence claim the call-set tag does not", () => {
    expect(justifiesArgs("PERMANENT: a JS Map has no initial_capacity")).toBe(true);
    expect(justifiesArgs("CONVERGEABLE: story <slug>")).toBe(true);
    expect(justifiesArgs("the argument is not needed here")).toBe(false);
    expect(justifiesArgs(DEFAULT_TAG_REASON)).toBe(false);
  });

  it("buildArgExpectations keeps shape rows and folds in already-suppressed calls", () => {
    const artifact: CallArgArtifact = {
      packages: ["activerecord"],
      compared: 3,
      mismatches: [
        {
          package: "activerecord",
          tsFile: "foo.ts",
          rubyName: "bar",
          call: "freeze",
          kind: "args",
          rubyArgs: ["true"],
          rubyFile: "foo.rb",
          tsName: "bar",
          class: "shape",
          tsArgs: [],
        },
        {
          package: "activerecord",
          tsFile: "foo.ts",
          rubyName: "bar",
          call: "dup",
          kind: "args",
          rubyArgs: ["ref:stmt"],
          rubyFile: "foo.rb",
          tsName: "bar",
          class: "naming",
          tsArgs: ["ref:statement"],
        },
      ],
      suppressed: [
        { package: "activerecord", tsFile: "foo.ts", tsName: "bar", call: "new", reason: "x" },
      ],
    };
    const byFile = buildArgExpectations(artifact, "activerecord");
    const exp = byFile.get("foo.ts")!.get(expectationKey(ANY_CLASS, "bar"))!;
    expect([...exp.calls].sort()).toEqual(["freeze", "new"]);
  });

  it("refuses a call whose sibling args row is still unreviewed", () => {
    // A tag suppresses by call NAME for the whole method (compare.ts:3573), so
    // minting from the curated row would also bless the site nobody reviewed —
    // and drop its row with the rest.
    const row = (rubyArgs: string[], reason: string) => ({
      package: "activerecord",
      tsFile: "foo.ts",
      rubyName: "bar",
      call: "freeze",
      kind: "args" as const,
      rubyArgs,
      reason,
    });
    const curated = row(["true"], "PERMANENT: a JS Map has no initial_capacity");
    expect(argReasons([curated]).get(keyOf(curated))).toBe(curated.reason);
    for (const rows of [
      [curated, row(["ref:stmt"], DEFAULT_TAG_REASON)],
      [row(["ref:stmt"], DEFAULT_TAG_REASON), curated],
    ]) {
      expect(argReasons(rows).get(keyOf(curated))).toBe(DEFAULT_TAG_REASON);
    }
  });

  it("migrationSummary names the args tag and drops the call-set caveat", () => {
    const rows = [
      {
        package: "activerecord",
        tsFile: "foo.ts",
        rubyName: "bar",
        call: "freeze",
        kind: "args" as const,
        rubyArgs: ["true"],
        reason: "PERMANENT: x",
      },
    ];
    const lines = migrationSummary(rows, 1, false, "args");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("1 of 1 baseline entr(ies) in scope migrated to @missingRailsArgs");
  });
});
