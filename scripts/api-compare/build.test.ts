import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAG_REASON,
  parseJsdoc,
  reconcile,
  reconcileFileText,
  renderJsdoc,
  buildExpectations,
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
    const r = reconcile(entries, new Set(["a", "b"]), reasonFor);
    expect(r.kept.map((e) => e.call)).toEqual(["a"]);
    expect(r.kept[0].reason).toBe("kept note");
    expect(r.added.map((e) => e.call)).toEqual(["b"]);
    expect(r.dropped).toEqual([]);
    const r2 = reconcile(entries, new Set(), reasonFor);
    expect(r2.dropped.map((e) => e.call)).toEqual(["a"]);
  });

  it("falls back to the placeholder when a curated reason is blank", () => {
    const r = reconcile([], new Set(["a"]), () => "  ");
    expect(r.added[0].reason).toBe(DEFAULT_TAG_REASON);
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
      ["bar", { rubyNames: ["bar"], calls: new Set(["save"]) }],
      ["baz", { rubyNames: ["baz"], calls: new Set(["reload"]) }],
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
      ["bar", { rubyNames: ["bar"], calls: new Set(["save"]) }],
      ["baz", { rubyNames: ["baz"], calls: new Set(["reload"]) }],
    ]);
    const first = reconcileFileText("foo.ts", FILE, expectations, () => "why").text!;
    const second = reconcileFileText("foo.ts", first, expectations, () => "why");
    expect(second.text).toBeNull();
  });

  it("reconciles set accessors (extract-ts-api extracts them into the artifact)", () => {
    const src = ["export class Foo {", "  set name(v: string) {}", "}"].join("\n");
    const expectations = new Map([
      ["name", { rubyNames: ["name="], calls: new Set(["write_attribute"]) }],
    ]);
    const { text } = reconcileFileText("foo.ts", src, expectations, () => "why");
    expect(text!).toContain("@missingRailsCall write_attribute — why");
  });

  it("round-trips a reason containing a Ruby ivar (@primary_key) across wraps", () => {
    const src = ["export class Foo {", "  bar(): void {}", "}"].join("\n");
    // Long enough that the wrapper would break right before the ivar word.
    const reason =
      "Per-entry verified (RFC 0032): Rails core.rb caches `klass.primary_key` into " +
      "@primary_key and calls `klass.define_attribute_methods`; neither call appears here.";
    const expectations = new Map([
      ["bar", { rubyNames: ["bar"], calls: new Set(["primary_key"]) }],
    ]);
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
      ["constructor", { rubyNames: ["initialize"], calls: new Set(["super"]) }],
      ["prototypePatched", { rubyNames: ["patched"], calls: new Set(["save"]) }],
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
    const expectations = new Map([["f", { rubyNames: ["f"], calls: new Set(["save"]) }]]);
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
      ["bar", { rubyNames: ["bar"], calls: new Set(["save"]) }],
      ["baz", { rubyNames: ["baz"], calls: new Set(["reload"]) }],
    ]);
    const { tagged } = reconcileFileText("foo.ts", FILE, expectations, () => "why");
    expect(tagged).toEqual([
      { rubyName: "bar", call: "save" },
      { rubyName: "baz", call: "reload" },
    ]);
  });

  it("reports a KEPT tag too — an already-tagged call owes no baseline row", () => {
    const expectations = new Map([["bar", { rubyNames: ["bar"], calls: new Set(["save"]) }]]);
    const first = reconcileFileText("foo.ts", FILE, expectations, () => "why").text!;
    const { tagged } = reconcileFileText("foo.ts", first, expectations, () => "why");
    expect(tagged).toEqual([{ rubyName: "bar", call: "save" }]);
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
      .get("insert")!.calls;
    expect([...calls].sort()).toEqual(["each", "first"]);
  });

  it("ignores other packages and honours the --file filter", () => {
    expect(buildExpectations(artifact, "other").has("insert-manager.ts")).toBe(false);
    expect(buildExpectations(artifact, "arel", "elsewhere.ts").size).toBe(0);
  });

  it("leaves a placeholder-reasoned row in the baseline — it justifies nothing", () => {
    const expectations = new Map([["bar", { rubyNames: ["bar"], calls: new Set(["save"]) }]]);
    const { tagged } = reconcileFileText("foo.ts", FILE, expectations, () => DEFAULT_TAG_REASON);
    expect(tagged).toEqual([]);
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
    const exp = buildExpectations(twoNames, "arel").get("insert-manager.ts")!.get("insert")!;
    expect(exp.rubyNames).toEqual(["insert", "insert_all"]);
  });
});

describe("reconcileFileText with two Ruby names on one TS method", () => {
  it("drops the baseline row of each Ruby name a justified tag covers", () => {
    const expectations = new Map([
      ["bar", { rubyNames: ["bar", "bar_all"], calls: new Set(["save"]) }],
    ]);
    const { tagged } = reconcileFileText("foo.ts", FILE, expectations, () => "why");
    expect(tagged).toEqual([
      { rubyName: "bar", call: "save" },
      { rubyName: "bar_all", call: "save" },
    ]);
  });

  it("seeds a new tag from whichever Ruby name has curated prose", () => {
    const expectations = new Map([
      ["bar", { rubyNames: ["bar", "bar_all"], calls: new Set(["save"]) }],
    ]);
    const { text } = reconcileFileText("foo.ts", FILE, expectations, (rubyName) =>
      rubyName === "bar_all" ? "curated" : DEFAULT_TAG_REASON,
    );
    expect(text!).toContain("@missingRailsCall save — curated");
  });
});
