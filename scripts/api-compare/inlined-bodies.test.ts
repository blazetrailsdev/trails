import { describe, it, expect } from "vitest";
import type { ApiManifest, CallSite, ClassInfo, MethodInfo } from "@blazetrails/parity/types";
import { dropWeakCalls, significantMissingCalls } from "./compare.js";
import {
  inlinedHookBody,
  inlinedRubyBody,
  inlinedRubyCallArgs,
  inlinedSegments,
  sameFileInitializeModules,
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
  return { file, includes, extends: [], instanceMethods: methods, classMethods: [] } as ClassInfo;
}

// activemodel/lib/active_model/api.rb:80-84
const api = body(["assign_attributes", "super"]);
// activerecord/lib/active_record/core.rb:471-482
const core = body(["init_internals", "initialize_internals_callback", "super", "run_callbacks"]);
const own = body(["build_reflection", "super"]);

const camel = (rc: string) => [rc.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())];
const significant = { has: () => true };
/** What the call gate flags for a constructor making `tsCalls` against a chain. */
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
    expect(inlinedSegments(own, [undefined], [undefined])).toEqual([]);
  });
});

describe("same-file module bodies join by convention", () => {
  // i18n/lib/i18n/backend/chain.rb: `Chain` includes `Implementation`, same file.
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

  it("joins a cross-file module only through its tag", () => {
    const ruby = {
      packages: {
        i18n: { classes: {}, modules },
        activemodel: { classes: {}, modules: { "ActiveModel::API": entity("api.rb", [], [api]) } },
      },
    } as unknown as ApiManifest;
    const tagged = inlinedHookBody(ruby, { module: "ActiveModel::API", hook: "initialize" });
    expect(tagged).toBe(api);
    expect(inlinedHookBody(ruby, { module: "ActiveModel::Missing", hook: "initialize" })).toBe(
      undefined,
    );
    expect(inlinedSegments(undefined, [], [tagged])).toEqual([api]);
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
