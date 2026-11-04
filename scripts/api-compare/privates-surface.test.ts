import { describe, it, expect } from "vitest";
import { buildReport } from "./extra-surface.js";
import type { ApiManifest, ClassInfo, MethodInfo } from "@blazetrails/parity/types";
import {
  buildPrivatesReport,
  collectPrivatesPopulation,
  formatPrivatesReport,
  gatePrivatesStale,
  parsePrivatesArgs,
} from "./privates-surface.js";

function m(
  name: string,
  visibility: MethodInfo["visibility"] = "public",
  extra: Partial<MethodInfo> = {},
): MethodInfo {
  return { name, visibility, params: [], ...extra };
}

function entity(name: string, file: string, opts: Partial<ClassInfo> = {}): ClassInfo {
  return { name, file, includes: [], extends: [], instanceMethods: [], classMethods: [], ...opts };
}

function manifest(
  source: "ruby" | "ts",
  classes: Record<string, ClassInfo>,
  modules: Record<string, ClassInfo> = {},
  fileFunctions: Record<string, MethodInfo[]> = {},
): ApiManifest {
  return {
    source,
    generatedAt: "",
    packages: { activemodel: { classes, modules, fileFunctions } },
  } as ApiManifest;
}

const RUBY = manifest(
  "ruby",
  {
    "ActiveModel::Foo": entity("Foo", "foo.rb", {
      includes: ["Helpers"],
      instanceMethods: [
        m("credited_one", "private"),
        m("guarded", "protected"),
        m("public_only"),
        m("perform_inner", "private"),
      ],
    }),
    "ActiveModel::Bar": entity("Bar", "bar.rb", {
      instanceMethods: [m("elsewhere", "private")],
    }),
  },
  {
    "ActiveModel::Helpers": entity("Helpers", "helpers.rb", {
      instanceMethods: [m("mixed_private", "private")],
    }),
  },
);

function tsFoo(members: MethodInfo[], fns: MethodInfo[] = []): ApiManifest {
  return manifest(
    "ts",
    { Foo: entity("Foo", "foo.ts", { instanceMethods: members }) },
    {},
    fns.length > 0 ? { "foo.ts": fns } : {},
  );
}

function kinds(ts: ApiManifest, ruby: ApiManifest = RUBY): Record<string, string> {
  const report = buildPrivatesReport(ruby, ts, { filterPkg: null });
  return Object.fromEntries(
    report.names.filter((n) => n.tsFile === "foo.ts").map((n) => [n.name, n.kind]),
  );
}

describe("collectPrivatesPopulation", () => {
  it("collects each population kind and holds out foreign and interface members", () => {
    const classes = [
      entity("Foo", "foo.ts", {
        instanceMethods: [
          m("publicOne"),
          m("hidden", "private"),
          m("#field", "private"),
          m("tagged", "public", { internal: true }),
          m("_cache"),
          m("inherited", "private", { declaredIn: "other.ts" }),
          m("constructor", "private"),
        ],
      }),
      entity("Shape", "foo.ts", {
        isInterface: true,
        instanceMethods: [m("_typed", "private")],
      }),
      entity("Mixin__mixin", "foo.ts", {
        synthesizedMixin: true,
        instanceMethods: [m("mixedIn", "private")],
      }),
    ];
    const fns = [
      m("helper", "private", { internal: true }),
      m("helperAlias", "private", { internal: true, bodyless: true, aliasOf: "helper" }),
      m("exportedInternal", "public", { internal: true }),
      m("_perfHelper", "private", { internal: true }),
    ];
    const population = collectPrivatesPopulation("foo.ts", classes, [], fns, ["SECRET"], ["_ID"]);
    expect(Object.fromEntries(population.map((p) => [p.name, p.population]))).toEqual({
      hidden: "modifier",
      "#field": "modifier",
      tagged: "internal",
      _cache: "underscore",
      helper: "fileLocal",
      exportedInternal: "internal",
      _perfHelper: "underscore",
      SECRET: "internal",
      _ID: "underscore",
    });
  });
});

describe("buildPrivatesReport", () => {
  it("credits a name only by a Ruby private or protected method of the mirrored file", () => {
    expect(kinds(tsFoo([m("creditedOne", "private"), m("guarded", "protected")]))).toEqual({
      creditedOne: "credited",
      guarded: "credited",
    });
  });

  it("reports a name whose only mirrored match is a Ruby public method as visibility", () => {
    expect(kinds(tsFoo([m("publicOnly", "private")]))).toEqual({ publicOnly: "visibility" });
  });

  it("credits a name public on one entity of the file and private on the declaring one", () => {
    const ruby = structuredClone(RUBY);
    ruby.packages.activemodel.classes["ActiveModel::Sibling"] = entity("Sibling", "foo.rb", {
      instanceMethods: [m("credited_one")],
    });
    expect(kinds(tsFoo([m("creditedOne", "private")]), ruby)).toEqual({ creditedOne: "credited" });
  });

  it("scores a Ruby method in another file as moved and nothing as novel", () => {
    expect(kinds(tsFoo([m("elsewhere", "private"), m("invented", "private")]))).toEqual({
      elsewhere: "moved",
      invented: "novel",
    });
  });

  it("finds a moved owner past the public lane's owner cap", () => {
    const ruby = structuredClone(RUBY);
    for (let i = 0; i < 6; i++)
      ruby.packages.activemodel.classes[`ActiveModel::Foo${i}`] = entity(`Foo${i}`, `foo${i}.rb`, {
        instanceMethods: [m("crowded")],
      });
    ruby.packages.activemodel.classes["ActiveModel::Bar"].instanceMethods.push(
      m("crowded", "private"),
    );
    const ts = tsFoo([m("crowded", "private")]);
    expect(buildPrivatesReport(ruby, ts, { filterPkg: null }).names).toMatchObject([
      { name: "crowded", kind: "moved" },
    ]);
  });

  it("strips a leading underscore once before matching", () => {
    expect(kinds(tsFoo([m("_performInner"), m("_publicOnly")]))).toEqual({
      _performInner: "credited",
      _publicOnly: "visibility",
    });
  });

  it("keeps an included module's private methods, which include makes private on the includer", () => {
    expect(kinds(tsFoo([], [m("mixedPrivate", "private", { internal: true })]))).toEqual({
      mixedPrivate: "credited",
    });
  });

  it("keeps a DelegateClass owner's private methods, which the public lane drops", () => {
    const ruby = structuredClone(RUBY);
    ruby.packages.activemodel.classes["ActiveModel::Wrap"] = entity("Wrap", "wrap.rb", {
      delegateClass: true,
      superclass: "Foo",
    });
    const ts = manifest("ts", {
      Wrap: entity("Wrap", "wrap.ts", { instanceMethods: [m("creditedOne", "private")] }),
    });
    expect(buildPrivatesReport(ruby, ts, { filterPkg: null }).names).toMatchObject([
      { name: "creditedOne", tsFile: "wrap.ts", kind: "credited" },
    ]);
  });

  it("scores an uncovered file against nothing, and totals per package", () => {
    const ts = manifest(
      "ts",
      {
        Foo: entity("Foo", "foo.ts", { instanceMethods: [m("creditedOne", "private")] }),
        Lone: entity("Lone", "lone.ts", { instanceMethods: [m("_elsewhere")] }),
      },
      {},
    );
    const report = buildPrivatesReport(RUBY, ts, { filterPkg: "activemodel" });
    expect(report.names.find((n) => n.tsFile === "lone.ts")).toMatchObject({
      rubyFile: null,
      kind: "moved",
    });
    expect(report.packages).toEqual([
      {
        package: "activemodel",
        population: 2,
        credited: 1,
        visibility: 0,
        moved: 1,
        novel: 0,
        allowed: 0,
        perf: 0,
      },
    ]);
    expect(formatPrivatesReport(report)).toContain("activemodel");
    expect(buildPrivatesReport(RUBY, ts, { filterPkg: "other" }).packages).toEqual([]);
  });
});

describe("visibility, receipts and @perf", () => {
  const P = { noRailsEquivalent: "PERMANENT" };

  it("credits a TS protected member mirroring a Ruby private one", () => {
    expect(kinds(tsFoo([m("creditedOne", "protected")]))).toEqual({ creditedOne: "credited" });
  });

  it("moves a receipted name to allowed and reports one on a credited name as STALE", () => {
    const report = buildPrivatesReport(
      RUBY,
      tsFoo([m("invented", "private", P), m("creditedOne", "private", P)]),
      { filterPkg: null },
    );
    expect(report.names.map((n) => [n.name, n.kind])).toEqual([
      ["invented", "allowed"],
      ["creditedOne", "credited"],
    ]);
    expect(report.stale.map((e) => e.name)).toEqual(["creditedOne"]);
    expect(gatePrivatesStale(report)).toContain("1 STALE @noRailsEquivalent tag(s)");
  });

  it("scores a JSDoc-@internal declaration carrying a receipt in the public lane only", () => {
    expect(kinds(tsFoo([m("invented", "public", P)]))).toEqual({});
  });

  it("counts @perf rows that are novel or moved, and subtracts nothing", () => {
    const perf = { perf: true };
    const report = buildPrivatesReport(
      RUBY,
      tsFoo([m("_invented", "public", perf), m("_creditedOne", "public", perf)]),
      { filterPkg: null },
    );
    expect(report.packages[0]).toMatchObject({ novel: 1, credited: 1, perf: 1 });
    expect(formatPrivatesReport(report)).toMatch(/visibility\s+moved\s+novel\s+allowed\s+perf/);
  });

  it("stops the public lane reporting a receipt the privates lane reads", () => {
    const stale = (members: MethodInfo[]): string[] =>
      buildReport(RUBY, tsFoo(members), {
        filterPkg: null,
        excludeGlobs: [],
        novelOnly: false,
        topN: 50,
      }).tagged.stale.map((e) => e.name);
    expect(stale([m("invented", "private", { ...P, internal: true })])).toEqual([]);
    expect(
      stale([m("unclassified", "private", { internal: true, noRailsEquivalent: "because" })]),
    ).toEqual(["unclassified"]);
  });
});

describe("parsePrivatesArgs", () => {
  it("parses --package and --json", () => {
    expect(parsePrivatesArgs(["--package", "arel", "--json"])).toEqual({
      filterPkg: "arel",
      json: true,
      help: false,
    });
  });
});
