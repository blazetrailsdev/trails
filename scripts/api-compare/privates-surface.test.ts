import { describe, it, expect } from "vitest";
import type { ApiManifest, ClassInfo, MethodInfo } from "@blazetrails/parity/types";
import {
  buildPrivatesReport,
  collectPrivatesPopulation,
  formatPrivatesReport,
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

function kinds(ts: ApiManifest): Record<string, string> {
  const report = buildPrivatesReport(RUBY, ts, { filterPkg: null });
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

  it("counts a name whose only mirrored match is a Ruby public method as novel", () => {
    expect(kinds(tsFoo([m("publicOnly", "private")]))).toEqual({ publicOnly: "novel" });
  });

  it("scores a Ruby method in another file as moved and nothing as novel", () => {
    expect(kinds(tsFoo([m("elsewhere", "private"), m("invented", "private")]))).toEqual({
      elsewhere: "moved",
      invented: "novel",
    });
  });

  it("strips a leading underscore once before matching", () => {
    expect(kinds(tsFoo([m("_performInner"), m("_publicOnly")]))).toEqual({
      _performInner: "credited",
      _publicOnly: "novel",
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
      { package: "activemodel", population: 2, credited: 1, moved: 1, novel: 0 },
    ]);
    expect(formatPrivatesReport(report)).toContain("activemodel");
    expect(buildPrivatesReport(RUBY, ts, { filterPkg: "other" }).packages).toEqual([]);
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
