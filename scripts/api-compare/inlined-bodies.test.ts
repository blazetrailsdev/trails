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
  blockRidesZsuper,
  inlinedHookBody,
  inlinedHookCreditedBy,
  inlinedHookTags,
  inlinedRubyBody,
  inlinedRubyCallArgs,
  inlinedRubySkeleton,
  inlinedSegments,
  isInitializeLessTaggedClass,
  moduleAncestors,
  portsSiblingClass,
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
      "assign_attributes",
      "super",
      "run_callbacks",
    ]);
    expect(inlinedRubyCallArgs(segments).map((s) => s.name)).toEqual([
      "init_internals",
      "initialize_internals_callback",
      "run_callbacks",
      "assign_attributes",
      "super",
    ]);
  });

  it("orders a super-first module's calls after the module its super reaches", () => {
    const model = of("Rails::Generators::ModelHelpers", body(["super", "plural_model_name?"]));
    const resource = of(
      "Rails::Generators::ResourceHelpers",
      body(["super", "assign_controller_names!"]),
    );
    const segments = inlinedSegments(undefined, none, [], [model, resource]);
    expect(inlinedRubyBody(segments).calls).toEqual([
      "super",
      "assign_controller_names!",
      "plural_model_name?",
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
      none,
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

  it("checks a method-level tag's citation against the def span", () => {
    const save = body(["with_transaction_returning_status", "super"], {
      name: "save",
      line: 360,
      endLine: 362,
      vendorFile: "rails/v8.0.2/activerecord/lib/active_record/transactions.rb",
    });
    const manifest = {
      packages: {
        activerecord: {
          classes: {},
          modules: {
            "ActiveRecord::Transactions": entity("transactions.rb", [], [save]),
          },
        },
      },
    } as unknown as ApiManifest;
    const methodTag = (lastLine: number): InlinedFrom => ({
      module: "ActiveRecord::Transactions",
      hook: "save",
      source: "rails",
      version: "v8.0.2",
      file: "activerecord/lib/active_record/transactions.rb",
      firstLine: 360,
      lastLine,
    });
    const where = "activerecord/base.ts Base#save";
    expect(inlinedHookBody(manifest, methodTag(362), where)).toBe(save);
    expect(() => inlinedHookBody(manifest, methodTag(363), where)).toThrow(
      /@inlinedFrom citation is stale: .*\/transactions\.rb:360-362\./,
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

  it("opens the chain with the class's own self.new, its super consumed by initialize", () => {
    const ownNew = { ...body(["lookup", "super"]), name: "new" };
    const klassNew = { ...body(["subclass_from_attributes", "super"]), name: "new" };
    const NEW = of("ActiveRecord::Inheritance::ClassMethods", klassNew);
    expect(inlinedSegments(own, none, [], [NEW], ownNew)).toEqual([ownNew, klassNew, own]);
    const segments = inlinedSegments(own, none, [], [], ownNew);
    expect(inlinedRubyBody(segments).calls).toEqual(["lookup", "build_reflection", "super"]);
    expect(inlinedSegments(own, none, [], [])).toEqual([]);
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
    const segments = inlinedSegments(undefined, none, [], [of("ActiveModel::API", apiArms)]);
    expect(inlinedRubySkeleton(segments)).toEqual(apiArms.skeleton);
    expect(compareArms(row(segments, ["if", "ref:assignAttributes", "ref:super"]))).toBeUndefined();
  });

  it("concatenates a class initialize and a module in chain order, the consumed super dropped", () => {
    const segments = inlinedSegments(ownArms, none, [], [of("ActiveModel::API", apiArms)]);
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
      row(inlinedSegments(ownArms, none, [], [of("ActiveModel::API", apiArms)]), [
        "throw:ArgumentError",
      ]),
    )!;
    expect(verdict.missing).toEqual(["if"]);
    expect(verdict.invented).toEqual([]);
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

  it("orders by statement, a later include first and one statement's first argument ahead", () => {
    const pool = {
      ...entity("pool.rb", ["A", "B", "C"], []),
      mixinOrder: [
        { kind: "include" as const, names: ["A", "B"] },
        { kind: "include" as const, names: ["C"] },
      ],
    };
    expect(moduleAncestors(pool, "Pool", modules, resolve).included).toEqual(["C", "A", "B"]);
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

describe("a self.new whose block only rides a bare super", () => {
  const rubyNew = (callArgs: CallSite[], params = ["block"]): MethodInfo => ({
    ...body([]),
    name: "new",
    params: params.map((name) => ({ name, kind: "block" })),
    callArgs,
  });
  const zsuper: CallSite = { name: "super", args: [], flags: ["zsuper"] };

  it("has no block of its own to compare", () => {
    expect(blockRidesZsuper(rubyNew([site("first"), zsuper]))).toBe(true);
  });

  it("keeps its block when the body calls, passes or yields to it, or never reaches super", () => {
    expect(blockRidesZsuper(rubyNew([site("first")]))).toBe(false);
    expect(blockRidesZsuper(rubyNew([site("super", ["id:name"])]))).toBe(false);
    expect(blockRidesZsuper(rubyNew([zsuper, site("yield")]))).toBe(false);
    expect(blockRidesZsuper(rubyNew([zsuper, { ...site("call"), recv: "id:block" }]))).toBe(false);
    expect(blockRidesZsuper(rubyNew([zsuper, site("tap", ["id:block"])]))).toBe(false);
    expect(blockRidesZsuper(rubyNew([zsuper, { ...site("each"), flags: ["blockpass"] }]))).toBe(
      false,
    );
    expect(blockRidesZsuper(rubyNew([zsuper], []))).toBe(false);
  });
});

describe("a module hook is credited through the tag on an includer's constructor", () => {
  const tagOf = (module: string, hook: InlinedFrom["hook"] = "initialize"): InlinedFrom => ({
    module,
    hook,
    source: "rails",
    version: "v8.0.2",
    file: "x.rb",
    firstLine: 1,
    lastLine: 2,
  });
  const tsClass = (file: string, inlinedFrom?: InlinedFrom[]): ClassInfo => ({
    ...entity(file, [], [{ ...body([]), name: "constructor", file, inlinedFrom }]),
  });
  const ts = {
    packages: {
      activemodel: { classes: { Model: tsClass("model.ts", [tagOf("ActiveModel::API")]) } },
      activerecord: {
        classes: {
          Base: tsClass("base.ts", [
            tagOf("ActiveRecord::Inheritance::ClassMethods", "new"),
            tagOf("ActiveModel::API"),
          ]),
          Relation: tsClass("relation.ts"),
        },
      },
    },
  } as unknown as ApiManifest;
  const def = (name: string) => ({
    ...body([]),
    name,
    vendorFile: "rails/v8.0.2/x.rb",
    line: 1,
    endLine: 2,
  });
  const ruby = {
    packages: {
      activemodel: {
        modules: { "ActiveModel::API": entity("api.rb", [], [def("initialize")]) },
      },
      activerecord: {
        modules: {
          "ActiveRecord::Inheritance::ClassMethods": entity("inheritance.rb", [], [def("new")]),
        },
      },
    },
  } as unknown as ApiManifest;
  const tags = inlinedHookTags(ts, ruby);

  it("credits nothing on a tag that resolves to no def, or cites it at a stale span", () => {
    const tagged = (tag: InlinedFrom) =>
      ({
        packages: { activerecord: { classes: { Base: tsClass("base.ts", [tag]) } } },
      }) as unknown as ApiManifest;
    expect(() => inlinedHookTags(tagged(tagOf("ActiveModel::APl")), ruby)).toThrow(
      /^@inlinedFrom names no Ruby body: activerecord\/base\.ts Base#constructor/,
    );
    expect(() =>
      inlinedHookTags(tagged({ ...tagOf("ActiveModel::API"), lastLine: 3 }), ruby),
    ).toThrow(/^@inlinedFrom citation is stale: activerecord\/base\.ts Base#constructor/);
  });

  it("credits the module when the tagged constructor's file mirrors an includer", () => {
    expect(
      inlinedHookCreditedBy(
        "ActiveModel::API",
        "initialize",
        "activemodel",
        new Set(["model.ts"]),
        tags,
      ),
    ).toEqual({ package: "activemodel", tsFile: "model.ts", tsName: "constructor" });
  });

  it("leaves it uncredited when the tagged file in its package includes no such module", () => {
    const only = inlinedHookTags(
      { packages: { activemodel: ts.packages.activemodel } } as unknown as ApiManifest,
      ruby,
    );
    expect(
      inlinedHookCreditedBy(
        "ActiveModel::API",
        "initialize",
        "activemodel",
        new Set(["validations.ts"]),
        only,
      ),
    ).toBeUndefined();
  });

  it("credits a tag on a constructor in another package", () => {
    expect(
      inlinedHookCreditedBy("ActiveModel::API", "initialize", "activemodel", new Set(), tags),
    ).toEqual({ package: "activerecord", tsFile: "base.ts", tsName: "constructor" });
  });

  it("keys a ClassMethods#new apart from the module's initialize, and an untagged hook from both", () => {
    const includers = new Set(["base.ts"]);
    const credited = (module: string, hook: InlinedFrom["hook"]) =>
      inlinedHookCreditedBy(module, hook, "activerecord", includers, tags)?.tsFile;
    expect(credited("ActiveRecord::Inheritance::ClassMethods", "new")).toBe("base.ts");
    expect(credited("ActiveRecord::Inheritance::ClassMethods", "initialize")).toBeUndefined();
    expect(credited("ActiveRecord::Core", "initialize")).toBeUndefined();
  });
});

describe("portsSiblingClass", () => {
  const klass = (file: string) => ({ file }) as unknown as ClassInfo;
  const classes = {
    "ActionDispatch::Integration::Session": klass("action_dispatch/testing/integration.rb"),
    "ActionDispatch::IntegrationTest": klass("action_dispatch/testing/integration.rb"),
    "ActionDispatch::Request": klass("action_dispatch/http/request.rb"),
  };

  it("refuses a TS class named after a sibling Ruby class of the same file", () => {
    expect(
      portsSiblingClass("IntegrationTest", "ActionDispatch::Integration::Session", classes),
    ).toBe(true);
  });

  it("keeps the same-named TS class", () => {
    expect(portsSiblingClass("IntegrationTest", "ActionDispatch::IntegrationTest", classes)).toBe(
      false,
    );
  });

  it("keeps a renamed TS class no Ruby class of the file is named after", () => {
    expect(portsSiblingClass("Helper", "ActionDispatch::Integration::Session", classes)).toBe(
      false,
    );
    expect(portsSiblingClass("Request", "ActionDispatch::Integration::Session", classes)).toBe(
      false,
    );
  });
});
