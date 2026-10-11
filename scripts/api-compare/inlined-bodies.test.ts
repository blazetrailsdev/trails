import { describe, it, expect } from "vitest";
import type {
  ApiManifest,
  CallSite,
  ClassInfo,
  InlinedFrom,
  MethodInfo,
} from "@blazetrails/parity/types";
import { dropWeakCalls, significantMissingCalls } from "./compare.js";
import { compareArms, type SkeletonRow } from "./report-arms.js";
import {
  inlinedRubyBody,
  inlinedRubyCallArgs,
  inlinedRubySkeleton,
  inlinedSegments,
  isInitializeLessTaggedClass,
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

function entity(file: string, includes: string[], methods: MethodInfo[] = []): ClassInfo {
  return {
    name: file,
    file,
    includes,
    extends: [],
    instanceMethods: methods,
    classMethods: [],
  } as ClassInfo;
}

const api = body(["assign_attributes", "super"]);
const core = body(["init_internals", "initialize_internals_callback", "super", "run_callbacks"]);
const own = body(["build_reflection", "super"]);

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
    const segments = inlinedSegments(undefined, [], [api]);
    expect(inlinedRubyBody(segments).calls).toEqual(["assign_attributes", "super"]);
    expect(flagged(segments, ["assignAttributes", "super"])).toEqual([]);
  });

  it("joins two modules in tag order, the first one's super consumed by the second", () => {
    const segments = inlinedSegments(undefined, [], [core, api]);
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
    const segments = inlinedSegments(own, [], [api]);
    expect(inlinedRubyBody(segments).calls).toEqual([
      "build_reflection",
      "assign_attributes",
      "super",
    ]);
    expect(inlinedRubyCallArgs(segments).filter((s) => s.name === "super")).toHaveLength(1);
  });

  it("flags a tagged body's call the constructor drops", () => {
    const segments = inlinedSegments(own, [], [api]);
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
    expect(inlinedSegments(own, [], [])).toEqual([]);
    expect(inlinedSegments(undefined, [], [])).toEqual([]);
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
  const sameFile = sameFileInitializeModules(chain, "I18n::Backend::Chain", modules, resolve);

  it("finds the same-file modules that define initialize, in ancestor order", () => {
    expect(sameFile).toEqual(["I18n::Backend::Fallbacks", "I18n::Backend::Chain::Implementation"]);
  });

  it("joins a same-file module with no tag", () => {
    const segments = inlinedSegments(undefined, [implementation], []);
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
    expect(tagged.map((m) => m.calls)).toEqual([api.calls]);
    expect(inlinedSegments(undefined, [], tagged)).toEqual(tagged);
  });

  it("pairs a class whose only initialize comes from a module in another package's manifest", () => {
    const classes = {
      "I18n::Config": entity("config.rb", ["ActiveModel::API"]),
      "Other::Config": entity("config.rb", ["ActiveModel::API"]),
      Plain: {},
    };
    const tagged = new Map([["Config", [tag("ActiveModel::API")]]]);
    const pair = (reaching: string[], compared: Set<string>, byOwner = tagged) =>
      ["I18n::Config", "Other::Config", "Plain", "I18n::Backend::Base"].filter((fqn) => {
        const paired = isInitializeLessTaggedClass(
          fqn,
          classes,
          new Set(reaching),
          byOwner,
          compared,
          "config.ts",
          (rubyModule) => rubyModule.split("::").at(-1),
        );
        if (paired) compared.add("config.ts Config");
        return paired;
      });
    expect(pair([], new Set())).toEqual(["I18n::Config"]);
    expect(pair(["I18n::Config"], new Set())).toEqual(["Other::Config"]);
    expect(pair([], new Set(["config.ts Config"]))).toEqual([]);
    expect(pair([], new Set(), new Map())).toEqual([]);
    const segments = inlinedSegments(
      undefined,
      [],
      taggedBodies(ruby, tagged.get("Config")!, [], at),
    );
    expect(flagged(segments, ["super"])).toEqual(["assign_attributes → assignAttributes"]);
    expect(inlinedRubyCallArgs(segments).map((s) => s.name)).toEqual(api.calls);
  });

  it("leaves a tag on a constructor with no Rails class to the never-compared throw", () => {
    const byFileOwner = new Map([["config.ts", new Map([["Stray", []]])]]);
    expect(
      isInitializeLessTaggedClass(
        "I18n::Config",
        { "I18n::Config": {} },
        new Set(),
        byFileOwner.get("config.ts"),
        new Set(),
        "config.ts",
        (fqn) => fqn.split("::").at(-1),
      ),
    ).toBe(false);
    expect(uncomparedInlinedTags(byFileOwner, new Set())).toEqual(["config.ts Stray"]);
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
    const segments = inlinedSegments(own, [], [core, klassNew, api]);
    expect(segments).toEqual([klassNew, own, core, api]);
    expect(inlinedRubyBody(segments).calls.filter((c) => c === "super")).toHaveLength(1);
  });

  it("orders a class with both: own, same-file, then tagged", () => {
    const segments = inlinedSegments(own, [implementation], [api]);
    expect(inlinedRubyBody(segments).calls).toEqual([
      "build_reflection",
      "backends",
      "assign_attributes",
      "super",
    ]);
  });
});

describe("a tagged constructor's Rails skeleton", () => {
  const apiArms = body([], { skeleton: ["if", "ref:assign_attributes", "ref:super"] });
  const ownArms = body([], {
    skeleton: ["ref:build_reflection", "throw:ArgumentError", "ref:super"],
  });
  const row = (segments: MethodInfo[], ts: string[]): SkeletonRow => ({
    package: "activemodel",
    rubyFile: "active_model/model.rb",
    rubyName: "initialize",
    tsFile: "model.ts",
    tsName: "constructor",
    ruby: inlinedRubySkeleton(segments),
    ts,
  });

  it("files no invented arm for a control token one module contributes", () => {
    const segments = inlinedSegments(undefined, [], [apiArms]);
    expect(inlinedRubySkeleton(segments)).toEqual(apiArms.skeleton);
    expect(compareArms(row(segments, ["if", "ref:assignAttributes", "ref:super"]))).toBeUndefined();
  });

  it("concatenates a class initialize and a module in chain order, the consumed super dropped", () => {
    const segments = inlinedSegments(ownArms, [], [apiArms]);
    expect(inlinedRubySkeleton(segments)).toEqual([
      "ref:build_reflection",
      "throw:ArgumentError",
      "if",
      "ref:assign_attributes",
      "ref:super",
    ]);
    expect(
      compareArms(row(segments, ["ref:buildReflection", "throw:ArgumentError", "if", "ref:super"])),
    ).toBeUndefined();
  });

  it("reports an arm a tagged body brings and the constructor drops as missing", () => {
    const verdict = compareArms(
      row(inlinedSegments(ownArms, [], [apiArms]), ["throw:ArgumentError"]),
    )!;
    expect(verdict.missing).toEqual(["if"]);
    expect(verdict.invented).toEqual([]);
  });
});
