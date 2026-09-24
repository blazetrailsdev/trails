import { describe, it, expect } from "vitest";
import type { ApiManifest, ClassInfo, MethodInfo } from "@blazetrails/parity/types";
import {
  callTagsSuppressingNothing,
  receiptsCoveringNothing,
  unverifiableReceipts,
} from "./receipt-audit.js";
import { callTagKey, staleCallTags, uncomparedCallTags } from "./compare.js";

function method(name: string, noRailsEquivalent?: string): MethodInfo {
  return {
    name,
    visibility: "public",
    params: [],
    ...(noRailsEquivalent === undefined ? {} : { noRailsEquivalent }),
  };
}

function entity(name: string, file: string, instanceMethods: MethodInfo[]): ClassInfo {
  return { name, file, includes: [], extends: [], instanceMethods, classMethods: [] };
}

function manifests(): { ruby: ApiManifest; ts: ApiManifest } {
  const ruby: ApiManifest = {
    source: "ruby",
    generatedAt: "",
    packages: {
      activemodel: {
        classes: { "ActiveModel::Foo": entity("Foo", "foo.rb", [method("bar")]) },
        modules: {},
      },
    },
  };
  const ts: ApiManifest = {
    source: "typescript",
    generatedAt: "",
    packages: {
      activemodel: {
        classes: {
          Foo: entity("Foo", "foo.ts", [method("bar"), method("tsOnlyHelper", "PERMANENT")]),
        },
        modules: {
          Shape: {
            ...entity("Shape", "foo.ts", [method("bar"), method("shapeOnly")]),
            isInterface: true,
            noRailsEquivalent: "PERMANENT",
          },
        },
        fileFunctions: { "foo.ts": [method("helper", "PERMANENT")] },
      },
    },
  };
  return { ruby, ts };
}

describe("receiptsCoveringNothing", () => {
  it("reports an exempt interface tag and its inherited members, not a tag covering an extra", () => {
    const { ruby, ts } = manifests();
    const found = receiptsCoveringNothing(ruby, ts, null).map(
      (e) => `${e.name}${e.inherited ? " (inherited)" : ""}`,
    );
    // `Shape` is a novel interface name, exempt by kind; `bar` is Rails-named
    // and `shapeOnly` is exempt with its interface. `tsOnlyHelper` and
    // `helper` are novel and really are covered by their tags.
    expect(found.sort()).toEqual(["Shape", "bar (inherited)", "shapeOnly (inherited)"]);
  });

  it("keeps a file-level tag whose file still has an extra", () => {
    const { ruby, ts } = manifests();
    ts.packages.activemodel.modules = {};
    ts.packages.activemodel.fileFunctions = { "foo.ts": [method("helper")] };
    ts.packages.activemodel.fileNoRailsEquivalent = { "foo.ts": "PERMANENT" };
    expect(receiptsCoveringNothing(ruby, ts, null).map((e) => e.name)).toEqual([]);
  });

  it("skips a receipt a `foo: NS.bar` property copies from its target", () => {
    const { ruby, ts } = manifests();
    ts.packages.activemodel.modules = {};
    ts.packages.activemodel.classes.Foo.instanceMethods[0] = {
      ...method("bar", "PERMANENT"),
      noRailsEquivalentInherited: true,
    };
    expect(receiptsCoveringNothing(ruby, ts, null).map((e) => e.name)).toEqual([]);
  });
});

describe("unverifiableReceipts", () => {
  const src = (text: string) => [{ package: "activemodel", file: "foo.ts", text }];

  it("reports a receipt on a declaration the extractor never harvested, per line", () => {
    const { ts } = manifests();
    const text = [
      'import { x } from "./x.js";',
      "",
      "/** @noRailsEquivalent PERMANENT */",
      "export function helper(): void {}",
      "",
      "/**",
      " * @internal",
      " * @noRailsEquivalent CONVERGEABLE some-story",
      " */",
      "function privateHelper(): void {}",
      "",
      "/** @noRailsEquivalent PERMANENT */",
      "type Alias = string;",
    ].join("\n");
    expect(unverifiableReceipts(ts, src(text))).toEqual([
      {
        package: "activemodel",
        file: "foo.ts",
        line: 10,
        name: "privateHelper",
        reason: "CONVERGEABLE some-story",
      },
      { package: "activemodel", file: "foo.ts", line: 13, name: "Alias", reason: "PERMANENT" },
    ]);
  });

  it("reads a class member's name past its modifiers and a computed key", () => {
    const { ts } = manifests();
    const text = [
      "export class Foo {",
      "  /** @noRailsEquivalent PERMANENT */",
      "  tsOnlyHelper(): void {}",
      "  /** @noRailsEquivalent PERMANENT */",
      "  private static readonly hidden = 1;",
      "  /** @noRailsEquivalent PERMANENT */",
      "  *[Symbol.iterator](): Iterator<number> {}",
      "}",
    ].join("\n");
    expect(unverifiableReceipts(ts, src(text)).map((r) => [r.line, r.name])).toEqual([
      [5, "hidden"],
      [7, "[Symbol.iterator]"],
    ]);
  });

  it("verifies a file-level tag against fileNoRailsEquivalent", () => {
    const { ts } = manifests();
    const text = '/** @noRailsEquivalent PERMANENT */\nimport { x } from "./x.js";\n';
    expect(unverifiableReceipts(ts, src(text))).toEqual([
      { package: "activemodel", file: "foo.ts", line: 2, name: null, reason: "PERMANENT" },
    ]);
    ts.packages.activemodel.fileNoRailsEquivalent = { "foo.ts": "PERMANENT" };
    expect(unverifiableReceipts(ts, src(text))).toEqual([]);
  });
});

describe("uncomparedCallTags", () => {
  const tags = (
    rows: [file: string, name: string, owner: string, call: string][],
  ): Map<string, Map<string, Map<string, Map<string, string>>>> => {
    const out = new Map<string, Map<string, Map<string, Map<string, string>>>>();
    for (const [file, name, owner, call] of rows) {
      const byName = out.get(file) ?? new Map<string, Map<string, Map<string, string>>>();
      const byOwner = byName.get(name) ?? new Map<string, Map<string, string>>();
      byOwner.set(owner, (byOwner.get(owner) ?? new Map<string, string>()).set(call, "PERMANENT"));
      out.set(file, byName.set(name, byOwner));
    }
    return out;
  };

  it("reports a tag on a declaration no pair compared, which staleCallTags skips", () => {
    const tagged = tags([["a.ts", "run", "A", "sleep"]]);
    const used = new Map<string, Set<string>>();
    expect(staleCallTags(tagged, used)).toEqual([]);
    expect(uncomparedCallTags(tagged, used)).toEqual([
      { tsFile: "a.ts", tsClass: "A", tsDeclFile: undefined, tsName: "run", call: "sleep" },
    ]);
  });

  it("does not report a compared declaration, whether or not its tag suppressed", () => {
    const tagged = tags([["a.ts", "run", "A", "sleep"]]);
    const used = new Map([[callTagKey("a.ts", "A", "run"), new Set<string>()]]);
    expect(uncomparedCallTags(tagged, used)).toEqual([]);
  });

  it("judges a barrel's aliased view by the declaring file's own record", () => {
    const tagged = tags([
      ["a.ts", "run", "A", "sleep"],
      ["index.ts", "run", "Alias", "sleep"],
    ]);
    const declFiles = new Map([["index.ts", new Map([["run", new Map([["Alias", "a.ts"]])]])]]);
    const compared = new Map([[callTagKey("a.ts", "A", "run"), new Set<string>()]]);
    expect(uncomparedCallTags(tagged, compared, declFiles)).toEqual([]);
    const throughView = new Map([[callTagKey("index.ts", "Alias", "run"), new Set<string>()]]);
    expect(uncomparedCallTags(tagged, throughView, declFiles)).toEqual([]);
    expect(uncomparedCallTags(tagged, new Map(), declFiles).map((t) => t.tsFile)).toEqual(["a.ts"]);
  });
});

describe("callTagsSuppressingNothing", () => {
  it("lists stale and uncompared tags together, filtered by package", () => {
    const tag = (pkg: string, tsName: string) => ({
      package: pkg,
      tsFile: "a.ts",
      tsName,
      call: "sleep",
    });
    const found = callTagsSuppressingNothing(
      { staleTags: [tag("activerecord", "run")], uncomparedTags: [tag("arel", "walk")] },
      null,
    );
    expect(found.map((t) => [t.tsName, t.compared])).toEqual([
      ["run", true],
      ["walk", false],
    ]);
    expect(
      callTagsSuppressingNothing({ uncomparedTags: [tag("arel", "walk")] }, "activerecord"),
    ).toEqual([]);
  });
});
