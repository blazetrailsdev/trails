import { describe, it, expect } from "vitest";
import type {
  ApiManifest,
  CallSite,
  ClassInfo,
  InlinedFrom,
  MethodInfo,
} from "@blazetrails/parity/types";
import { dropWeakCalls, significantMissingCalls } from "./compare.js";
import {
  inlinedRubyBody,
  inlinedRubyCallArgs,
  inlinedSegments,
  moduleAncestors,
  type ModuleBody,
  sameFileInitializeModules,
  taggedBodies,
  uncomparedInlinedTags,
} from "./inlined-bodies.js";

const site = (name: string, args: string[] = []): CallSite => ({ name, args, flags: [] });

function body(calls: string[], extra: Partial<MethodInfo> = {}): MethodInfo {
  return {
    name: "initialize",
    visibility: "public",
    params: [],
    calls,
    callArgs: calls.map((c) => site(c)),
    ...extra,
  } as MethodInfo;
}

function entity(
  file: string,
  includes: string[],
  methods: MethodInfo[] = [],
  prepends: string[] = [],
): ClassInfo {
  return {
    name: file,
    file,
    includes,
    prepends,
    extends: [],
    instanceMethods: methods,
    classMethods: [],
  } as ClassInfo;
}

const api = body(["assign_attributes", "super"]);
const core = body(["init_internals", "initialize_internals_callback", "super", "run_callbacks"]);
const own = body(["build_reflection", "super"]);
const none = { prepended: [], included: [] };
const of = (module: string, body: MethodInfo): ModuleBody => ({ module, body });
const API = of("ActiveModel::API", api);
const CORE = of("ActiveRecord::Core", core);

const camel = (rc: string) => [rc.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())];
const significant = { has: () => true };
function flagged(segments: MethodInfo[], tsCalls: string[]): string[] {
  const ruby = inlinedRubyBody(segments);
  return significantMissingCalls(
    "initialize",
    dropWeakCalls(ruby.calls, ruby.weak),
    new Set(tsCalls),
    () => true,
    camel,
    significant,
    () => [],
    new Set(),
    ruby.calls,
  );
}

describe("a tagged constructor's Rails call set", () => {
  it("is the tagged module's initialize when the class defines none", () => {
    const segments = inlinedSegments(undefined, none, [], [API]);
    expect(inlinedRubyBody(segments).calls).toEqual(["assign_attributes", "super"]);
    expect(flagged(segments, ["assignAttributes", "super"])).toEqual([]);
  });

  it("joins two modules in tag order, the first one's super consumed by the second", () => {
    const segments = inlinedSegments(undefined, none, [], [CORE, API]);
    expect(inlinedRubyBody(segments).calls).toEqual([
      "init_internals",
      "initialize_internals_callback",
      "run_callbacks",
      "assign_attributes",
      "super",
    ]);
    expect(inlinedRubyCallArgs(segments).map((s) => s.name)).toEqual([
      "init_internals",
      "initialize_internals_callback",
      "run_callbacks",
      "assign_attributes",
      "super",
    ]);
  });

  it("puts the class's own initialize ahead of a module", () => {
    const segments = inlinedSegments(own, none, [], [API]);
    expect(inlinedRubyBody(segments).calls).toEqual([
      "build_reflection",
      "assign_attributes",
      "super",
    ]);
    expect(inlinedRubyCallArgs(segments).filter((s) => s.name === "super")).toHaveLength(1);
  });

  it("flags a tagged body's call the constructor drops", () => {
    const segments = inlinedSegments(own, none, [], [API]);
    expect(flagged(segments, ["buildReflection", "assignAttributes", "super"])).toEqual([]);
    expect(flagged(segments, ["buildReflection", "super"])).toEqual([
      "assign_attributes → assignAttributes",
    ]);
  });

  it("keeps a call weak only when no segment makes it on a live receiver", () => {
    const weakOnly = body(["fetch", "super"], { weakCalls: ["fetch"] });
    expect(inlinedRubyBody([weakOnly, api]).weak).toEqual(["fetch"]);
    expect(inlinedRubyBody([weakOnly, body(["fetch"])]).weak).toEqual([]);
  });

  it("leaves a class with no same-file module and no tag to the ordinary gate", () => {
    expect(inlinedSegments(own, none, [], [])).toEqual([]);
    expect(inlinedSegments(undefined, none, [], [])).toEqual([]);
  });
});

describe("same-file module bodies join by convention", () => {
  const implementation = body(["backends", "super"]);
  const modules: Record<string, ClassInfo> = {
    "I18n::Backend::Chain::Implementation": entity("backend/chain.rb", ["Base"], [implementation]),
    "I18n::Backend::Base": entity("backend/base.rb", [], [body(["eager_load"])]),
    "I18n::Backend::Fallbacks": entity("backend/chain.rb", [], [body(["fallbacks", "super"])]),
    "I18n::Backend::Flatten": entity("backend/chain.rb", [], []),
  };
  const resolve = (inc: string) =>
    Object.keys(modules).find((fqn) => fqn === inc || fqn.endsWith(`::${inc}`)) ?? inc;
  const chain = entity("backend/chain.rb", ["Implementation", "Flatten", "Fallbacks"]);
  const ancestors = moduleAncestors(chain, "I18n::Backend::Chain", modules, resolve);
  const sameFile = sameFileInitializeModules(chain, ancestors, modules);
  const IMPLEMENTATION = of("I18n::Backend::Chain::Implementation", implementation);

  it("finds the same-file modules that define initialize, in ancestor order", () => {
    expect(sameFile).toEqual(["I18n::Backend::Fallbacks", "I18n::Backend::Chain::Implementation"]);
  });

  it("joins a same-file module with no tag", () => {
    const segments = inlinedSegments(undefined, ancestors, [IMPLEMENTATION], []);
    expect(flagged(segments, ["super"])).toEqual(["backends → backends"]);
  });

  const ruby = {
    packages: {
      i18n: { classes: {}, modules },
      activemodel: {
        classes: {},
        modules: {
          "ActiveModel::API": entity(
            "api.rb",
            [],
            [
              {
                ...api,
                vendorFile: "rails/v8.0.2/activemodel/lib/active_model/api.rb",
                line: 80,
                endLine: 84,
              },
            ],
          ),
        },
      },
    },
  } as unknown as ApiManifest;
  const tag = (module: string, firstLine = 80, lastLine = 84, file = "api.rb"): InlinedFrom => ({
    module,
    hook: "initialize",
    source: "rails",
    version: "v8.0.2",
    file: `activemodel/lib/active_model/${file}`,
    firstLine,
    lastLine,
  });
  const at = "activemodel/model.ts Model#constructor";

  it("joins a cross-file module only through its tag", () => {
    const tagged = taggedBodies(ruby, [tag("ActiveModel::API")], sameFile, at);
    expect(tagged.map((m) => [m.module, m.body.calls])).toEqual([["ActiveModel::API", api.calls]]);
    expect(inlinedSegments(undefined, none, [], tagged)).toEqual(tagged.map((m) => m.body));
  });

  it("reds on a tag that resolves to no Ruby body", () => {
    expect(() => taggedBodies(ruby, [tag("ActiveModel::Missing")], [], at)).toThrow(
      /@inlinedFrom names no Ruby body: activemodel\/model\.ts Model#constructor/,
    );
  });

  it.each([
    ["first line", tag("ActiveModel::API", 81)],
    ["last line", tag("ActiveModel::API", 80, 85)],
    ["file", tag("ActiveModel::API", 80, 84, "model.rb")],
    ["directory", { ...tag("ActiveModel::API"), file: "foo/lib/active_model/api.rb" }],
    ["version", { ...tag("ActiveModel::API"), version: "v7.2.0" }],
  ])("reds on a citation whose %s is not the def's", (_what, stale) => {
    expect(() => taggedBodies(ruby, [stale], [], at)).toThrow(
      /@inlinedFrom citation is stale: .* at rails\/v8\.0\.2\/activemodel\/lib\/active_model\/api\.rb:80-84\./,
    );
  });

  it("reds, apart from stale, on a def the manifest recorded no vendor path for", () => {
    const bare = { packages: { m: { classes: {}, modules: { A: entity("a.rb", [], [api]) } } } };
    expect(() => taggedBodies(bare as unknown as ApiManifest, [tag("A")], [], at)).toThrow(
      /@inlinedFrom cannot be checked: .* has no vendorFile/,
    );
  });

  it("reds on a tag naming a same-file module", () => {
    expect(() => taggedBodies(ruby, [tag(sameFile[0])], sameFile, at)).toThrow(
      /@inlinedFrom is redundant/,
    );
  });

  it("names a tagged constructor the pairing pass never read", () => {
    const byFileOwner = new Map([
      [
        "model.ts",
        new Map([
          ["Model", []],
          ["Other", []],
        ]),
      ],
    ]);
    expect(uncomparedInlinedTags(byFileOwner, new Set(["model.ts Model"]))).toEqual([
      "model.ts Other",
    ]);
  });

  it("runs a tagged ClassMethods#new ahead of every initialize, its super consumed", () => {
    const klassNew = { ...body(["subclass_from_attributes", "super"]), name: "new" };
    const NEW = of("ActiveRecord::Inheritance::ClassMethods", klassNew);
    const segments = inlinedSegments(own, none, [], [CORE, NEW, API]);
    expect(segments).toEqual([klassNew, own, core, api]);
    expect(inlinedRubyBody(segments).calls.filter((c) => c === "super")).toHaveLength(1);
  });

  it("orders a class with both: own, same-file, then a tag naming no ancestor", () => {
    const segments = inlinedSegments(own, ancestors, [IMPLEMENTATION], [API]);
    expect(inlinedRubyBody(segments).calls).toEqual([
      "build_reflection",
      "backends",
      "assign_attributes",
      "super",
    ]);
  });
});

describe("the chain follows the class's ancestor order", () => {
  const resolve = (inc: string) => inc;
  const dirties = body(["dirties", "super"]);
  const flash = body(["flash", "super"]);
  const lock = body(["mon_initialize", "super"]);
  const modules: Record<string, ClassInfo> = {
    Dirties: entity("pool.rb", [], [dirties]),
    Flash: entity("pool.rb", ["Lock"], [flash], ["Dirties"]),
    Lock: entity("pool.rb", [], [lock]),
    Plain: entity("pool.rb", [], []),
  };
  const sameFileBodies = (klass: ClassInfo) => {
    const ancestors = moduleAncestors(klass, "Pool", modules, resolve);
    const sameFile = sameFileInitializeModules(klass, ancestors, modules);
    return { ancestors, sameFile: sameFile.map((fqn) => of(fqn, modules[fqn].instanceMethods[0])) };
  };

  it("lists prepended modules last prepend first, each between its own prepends and includes", () => {
    const pool = entity("pool.rb", ["Plain", "API"], [], ["Lock", "Flash"]);
    expect(moduleAncestors(pool, "Pool", modules, resolve)).toEqual({
      prepended: ["Dirties", "Flash", "Lock"],
      included: ["API", "Plain"],
    });
  });

  it("runs a prepended same-file module ahead of the class's own body", () => {
    const { ancestors, sameFile } = sameFileBodies(entity("pool.rb", ["Lock"], [], ["Dirties"]));
    const segments = inlinedSegments(own, ancestors, sameFile, []);
    expect(segments).toEqual([dirties, own, lock]);
    expect(inlinedRubyCallArgs(segments).map((s) => s.name)).toEqual([
      "dirties",
      "build_reflection",
      "mon_initialize",
      "super",
    ]);
  });

  it("places a same-file module between two tagged ones", () => {
    const pool = entity("pool.rb", ["ActiveModel::API", "Lock", "ActiveRecord::Core"]);
    const { ancestors, sameFile } = sameFileBodies(pool);
    expect(inlinedSegments(own, ancestors, sameFile, [API, CORE])).toEqual([own, core, lock, api]);
  });
});
