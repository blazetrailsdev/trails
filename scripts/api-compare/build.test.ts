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
  lowerMarksForDropped,
} from "./build.js";
import { serializeBaseline } from "./baseline-json.js";
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
    const r = reconcileFileText("foo.ts", FILE, new Map(), () => DEFAULT_TAG_REASON);
    expect(r.harvested.map((h) => h.entry.reason)).toEqual(["placeholder to drop"]);
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
    const { text } = reconcileFileText("foo.ts", src, new Map(), () => "x");
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
