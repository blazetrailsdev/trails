import { describe, expect, it } from "vitest";
import type { ApiManifest, ClassInfo, InlinedFrom, MethodInfo } from "@blazetrails/parity/types";
import type { InlinedFromPair } from "./inlined-bodies.js";
import { MISSING_TAG_PACKAGES, fixCitations, inlinedFromFindings } from "./lint-inlined-from.js";

const def = (name: string, vendorFile: string, line: number, endLine: number): MethodInfo =>
  ({
    name,
    visibility: "public",
    params: [],
    calls: ["super"],
    vendorFile,
    line,
    endLine,
  }) as MethodInfo;

function entity(
  file: string,
  instanceMethods: MethodInfo[] = [],
  mixins: Partial<Pick<ClassInfo, "includes" | "prepends" | "extends" | "mixinOrder">> = {},
) {
  return { file, includes: [], extends: [], instanceMethods, classMethods: [], ...mixins };
}

const AM = "rails/v8.0.2/activemodel/lib/active_model";
const AR = "rails/v8.0.2/activerecord/lib/active_record";

const CONCERN = { extends: ["ActiveSupport::Concern"] };

const ruby = {
  packages: {
    activemodel: {
      classes: {},
      modules: {
        "ActiveModel::API": entity("api.rb", [def("initialize", `${AM}/api.rb`, 80, 84)]),
        "ActiveModel::Naming": entity("naming.rb"),
      },
    },
    activerecord: {
      classes: {
        "ActiveRecord::Base": entity("base.rb", [], {
          includes: ["ActiveModel::API", "Core", "Inheritance", "Local", "Plain"],
          extends: ["First::ClassMethods", "Last::ClassMethods"],
          mixinOrder: [
            { kind: "include", names: ["ActiveModel::API"] },
            { kind: "extend", names: ["First::ClassMethods"] },
            { kind: "include", names: ["Core", "Inheritance"] },
            { kind: "extend", names: ["Last::ClassMethods"] },
            { kind: "include", names: ["Local", "Plain"] },
          ],
        }),
        "ActiveRecord::Relation": entity("relation.rb"),
        "ActiveRecord::Multi": entity("multi.rb", [], {
          includes: ["ActiveModel::API", "Core"],
          mixinOrder: [{ kind: "include", names: ["ActiveModel::API", "Core"] }],
        }),
        "ActiveRecord::Proxy": entity(
          "proxy.rb",
          [{ ...def("initialize", `${AR}/proxy.rb`, 2, 4), calls: [] }],
          { includes: ["Core"] },
        ),
        "ActiveRecord::Spanless": entity(
          "spanless.rb",
          [{ name: "initialize", visibility: "public", params: [] } as MethodInfo],
          { includes: ["Core"] },
        ),
        "ActiveRecord::Session": entity(
          "session.rb",
          [def("initialize", `${AR}/session.rb`, 2, 4)],
          {
            includes: ["Core"],
          },
        ),
        "ActiveRecord::Batch": entity("batch.rb", [], {
          prepends: ["Inheritance"],
          extends: ["First::ClassMethods"],
          mixinOrder: [
            { kind: "prepend", names: ["Inheritance"] },
            { kind: "extend", names: ["First::ClassMethods"] },
          ],
        }),
      },
      modules: {
        "ActiveRecord::Core": entity("core.rb", [
          def("initialize", `${AR}/core.rb`, 471, 482),
          def("save", `${AR}/core.rb`, 490, 492),
        ]),
        "ActiveRecord::Inheritance": entity(
          "inheritance.rb",
          [{ ...def("save", `${AR}/inheritance.rb`, 90, 92), calls: [] }],
          CONCERN,
        ),
        "ActiveRecord::First::ClassMethods": entity("first.rb", [
          def("new", `${AR}/first.rb`, 2, 4),
        ]),
        "ActiveRecord::Last::ClassMethods": entity("last.rb", [def("new", `${AR}/last.rb`, 2, 4)]),
        "ActiveRecord::Plain": entity("plain.rb", [def("save", `${AR}/plain.rb`, 8, 10)]),
        "ActiveRecord::Plain::ClassMethods": entity("plain.rb", [
          def("new", `${AR}/plain.rb`, 2, 4),
        ]),
        "ActiveRecord::Inheritance::ClassMethods": entity("inheritance.rb", [
          def("new", `${AR}/inheritance.rb`, 56, 78),
        ]),
        "ActiveRecord::Base::Local": entity(
          "base.rb",
          [def("initialize", `${AR}/base.rb`, 3, 5)],
          CONCERN,
        ),
        "ActiveRecord::Base::Local::ClassMethods": entity("base.rb", [
          def("new", `${AR}/base.rb`, 7, 9),
        ]),
      },
    },
  },
} as unknown as ApiManifest;

const tag = (name: string, citation: string): InlinedFrom => {
  const [module, hook] = name.split("#");
  const [, source, version, file, first, last] = citation.match(
    /^(\w+)\/([\w.]+)\/(.+):(\d+)-(\d+)$/,
  )!;
  return {
    module,
    hook: hook,
    source,
    version,
    file,
    firstLine: Number(first),
    lastLine: Number(last),
  };
};

const FIRST = tag("ActiveRecord::First::ClassMethods#new", `${AR}/first.rb:2-4`);
const LAST = tag("ActiveRecord::Last::ClassMethods#new", `${AR}/last.rb:2-4`);
const NEW = tag("ActiveRecord::Inheritance::ClassMethods#new", `${AR}/inheritance.rb:56-78`);
const CORE = tag("ActiveRecord::Core#initialize", `${AR}/core.rb:471-482`);
const API = tag("ActiveModel::API#initialize", `${AM}/api.rb:80-84`);

function messages(
  inlinedFrom: InlinedFrom[],
  {
    owner = "Base",
    file = "base.ts",
    enrolled = [] as string[],
    reexport = false,
    alias = undefined as string | undefined,
    sibling = false,
    pairs = [] as InlinedFromPair[],
  } = {},
): string[] {
  const ctor = { ...def("constructor", "", 1, 1), file, inlinedFrom };
  const classes = reexport
    ? {
        [`${file}:${owner}`]: { ...entity(file, [ctor]), name: owner },
        [`index.ts:${alias ?? owner}`]: { ...entity("index.ts", [ctor]), name: alias ?? owner },
      }
    : { [owner]: entity(file, [ctor]) };
  if (sibling) Object.assign(classes, { Sibling: entity(file) });
  const ts = { packages: { activerecord: { classes, modules: {} } } } as unknown as ApiManifest;
  return inlinedFromFindings(ruby, ts, enrolled, pairs).map((f) => `${f.hook} ${f.message}`);
}

function methodMessages(inlinedFrom: InlinedFrom[], owner = "Base"): string[] {
  const file = `${owner.toLowerCase()}.ts`;
  const save = { ...def("save", "", 1, 1), file, inlinedFrom };
  const ts = {
    packages: { activerecord: { classes: { [owner]: entity(file, [save]) }, modules: {} } },
  } as unknown as ApiManifest;
  return inlinedFromFindings(ruby, ts, []).map((f) => `${f.member} ${f.hook} ${f.message}`);
}

describe("inlinedFromFindings on a method inlining module super", () => {
  const PLAIN_SAVE = tag("ActiveRecord::Plain#save", `${AR}/plain.rb:8-10`);
  const CORE_SAVE = tag("ActiveRecord::Core#save", `${AR}/core.rb:490-492`);

  it("passes tags for the module methods the class reaches, in ancestor order", () => {
    expect(methodMessages([PLAIN_SAVE, CORE_SAVE])).toEqual([]);
  });

  it("flags a stale citation, out-of-order tags and a module the class does not include", () => {
    expect(methodMessages([tag("ActiveRecord::Core#save", `${AR}/core.rb:491-492`)])).toEqual([
      "save ActiveRecord::Core#save citation is stale: cited at rails/v8.0.2/activerecord/lib/active_record/core.rb:491-492, the manifest has rails/v8.0.2/activerecord/lib/active_record/core.rb:490-492",
    ]);
    expect(methodMessages([CORE_SAVE, PLAIN_SAVE])).toEqual([
      "save ActiveRecord::Plain#save is out of chain order: Rails runs it before ActiveRecord::Core#save",
    ]);
    expect(methodMessages([CORE_SAVE], "Relation")).toEqual([
      "save ActiveRecord::Core#save names a module ActiveRecord::Relation does not include or prepend",
    ]);
  });

  it("flags a module method whose Rails body calls no super", () => {
    expect(
      methodMessages([tag("ActiveRecord::Inheritance#save", `${AR}/inheritance.rb:90-92`)]),
    ).toEqual([
      "save ActiveRecord::Inheritance#save names a module method whose Rails body calls no `super`",
    ]);
  });
});

describe("inlinedFromFindings", () => {
  it("passes a constructor tagged for each cross-file hook its Rails class reaches", () => {
    expect(messages([LAST, NEW, FIRST, CORE, API], { enrolled: ["activerecord"] })).toEqual([]);
  });

  it("flags a tag naming a module with no initialize", () => {
    expect(messages([tag("ActiveModel::Naming#initialize", `${AM}/naming.rb:1-2`)])).toEqual([
      "ActiveModel::Naming#initialize names no Ruby body: the manifest has no such `def`",
    ]);
  });

  it("flags a tag naming a module the Rails class does not include, prepend or extend", () => {
    const relation = { owner: "Relation", file: "relation.ts" };
    expect(messages([CORE], relation)).toEqual([
      "ActiveRecord::Core#initialize names a module ActiveRecord::Relation does not include or prepend",
    ]);
    expect(messages([NEW], relation)).toEqual([
      "ActiveRecord::Inheritance::ClassMethods#new names a module ActiveRecord::Relation does not extend",
    ]);
  });

  it("does not read a plain module's ClassMethods as extended, which only a Concern does", () => {
    const plain = tag("ActiveRecord::Plain::ClassMethods#new", `${AR}/plain.rb:2-4`);
    expect(messages([plain, LAST, NEW, FIRST, CORE, API], { enrolled: ["activerecord"] })).toEqual([
      "ActiveRecord::Plain::ClassMethods#new names a module ActiveRecord::Base does not extend",
    ]);
  });

  it("flags a tag written twice, and one out of Ruby's chain order", () => {
    expect(messages([NEW, CORE, CORE, API])).toEqual([
      "ActiveRecord::Core#initialize is tagged more than once: Rails runs the body once",
    ]);
    expect(messages([NEW, API, CORE])).toEqual([
      "ActiveRecord::Core#initialize is out of chain order: Rails runs it before ActiveModel::API#initialize",
    ]);
  });

  it("orders the singleton side by statement, last extend or Concern include first", () => {
    expect(messages([LAST, NEW, FIRST, CORE, API])).toEqual([]);
    expect(messages([NEW, LAST, FIRST])).toEqual([
      "ActiveRecord::Last::ClassMethods#new is out of chain order: Rails runs it before ActiveRecord::Inheritance::ClassMethods#new",
    ]);
    expect(messages([LAST, FIRST, NEW])).toEqual([
      "ActiveRecord::Inheritance::ClassMethods#new is out of chain order: Rails runs it before ActiveRecord::First::ClassMethods#new",
    ]);
    expect(messages([CORE, NEW])).toEqual([
      "ActiveRecord::Inheritance::ClassMethods#new is out of chain order: Rails runs it before ActiveRecord::Core#initialize",
    ]);
  });

  it("orders a prepended Concern's ClassMethods ahead of a later explicit extend", () => {
    const batch = { owner: "Batch", file: "batch.ts" };
    expect(messages([NEW, FIRST], batch)).toEqual([]);
    expect(messages([FIRST, NEW], batch)).toEqual([
      "ActiveRecord::Inheritance::ClassMethods#new is out of chain order: Rails runs it before ActiveRecord::First::ClassMethods#new",
    ]);
  });

  it("pairs a constructor with the Rails class compare.ts compared it against", () => {
    const pairs = [
      {
        package: "activerecord",
        tsFile: "base.ts",
        owner: "Helper",
        rubyModule: "ActiveRecord::Base",
      },
    ];
    const enrolled = ["activerecord"];
    const tags = [LAST, NEW, FIRST, CORE, API];
    expect(messages(tags, { owner: "Helper", sibling: true, enrolled, pairs })).toEqual([]);
  });

  it("refuses a constructor compare.ts paired with two Rails classes", () => {
    const pair = { package: "activerecord", tsFile: "base.ts", owner: "Base" };
    const pairs = [
      { ...pair, rubyModule: "ActiveRecord::Base" },
      { ...pair, rubyModule: "ActiveRecord::Relation" },
    ];
    expect(() => messages([LAST, NEW, FIRST, CORE, API], { pairs })).toThrow(/compared against/);
  });

  it("orders one include statement's first argument ahead of its second", () => {
    const multi = { owner: "Multi", file: "multi.ts" };
    expect(messages([API, CORE], multi)).toEqual([]);
    expect(messages([CORE, API], multi)).toEqual([
      "ActiveModel::API#initialize is out of chain order: Rails runs it before ActiveRecord::Core#initialize",
    ]);
  });

  it("flags a tag on a constructor that mirrors no Rails class", () => {
    expect(messages([CORE], { owner: "Helper", file: "helper.ts" })[0]).toContain(
      "mirror no Rails class or module",
    );
    expect(messages([CORE], { owner: "Helper", sibling: true })[0]).toContain(
      "mirror no Rails class or module",
    );
  });

  it("flags a citation that differs from the manifest's def span, with the fix", () => {
    const stale = tag(
      "ActiveRecord::Core#initialize",
      "rails/v7.1.0/activerecord/lib/active_record/core.rb:460-470",
    );
    const ts = {
      packages: {
        activerecord: {
          classes: {
            Base: entity("base.ts", [{ ...def("constructor", "", 1, 1), inlinedFrom: [stale] }]),
          },
          modules: {},
        },
      },
    } as unknown as ApiManifest;
    const findings = inlinedFromFindings(ruby, ts);
    expect(findings.map((f) => f.fix)).toEqual([
      {
        cited: "rails/v7.1.0/activerecord/lib/active_record/core.rb:460-470",
        actual: `${AR}/core.rb:471-482`,
      },
    ]);
    const source = ` * @inlinedFrom ActiveRecord::Core#initialize ${findings[0].fix!.cited}\n`;
    expect(fixCitations(source, findings)).toBe(
      ` * @inlinedFrom ActiveRecord::Core#initialize ${AR}/core.rb:471-482\n`,
    );
  });

  it("flags a tag on a body from the constructor's own mirrored Ruby file", () => {
    const local = tag("ActiveRecord::Base::Local#initialize", `${AR}/base.rb:3-5`);
    expect(messages([local])).toEqual([
      "ActiveRecord::Base::Local#initialize is redundant: a body from the mirrored Ruby file is inlined untagged",
    ]);
  });

  it("flags an enrolled package's untagged cross-file initialize and ClassMethods#new, and no same-file body", () => {
    expect(messages([LAST, FIRST, CORE], { enrolled: ["activerecord"] })).toEqual([
      "ActiveRecord::Inheritance::ClassMethods#new is inlined untagged: ActiveRecord::Base reaches it from another Ruby file",
      "ActiveModel::API#initialize is inlined untagged: ActiveRecord::Base reaches it from another Ruby file",
    ]);
  });

  it("leaves the missing-tag arm off for a package that is not enrolled", () => {
    expect(messages([])).toEqual([]);
    expect(MISSING_TAG_PACKAGES).toEqual([
      "actioncontroller",
      "actiondispatch",
      "actionview",
      "activejob",
      "activesupport",
      "i18n",
      "rack",
      "rack-test",
    ]);
  });

  it("pairs a class by its name under a file-qualified key, and once when an index re-exports it", () => {
    const enrolled = ["activerecord"];
    expect(messages([LAST, NEW, FIRST, CORE, API], { enrolled, reexport: true })).toEqual([]);
    expect(messages([LAST, NEW, FIRST, CORE], { enrolled, reexport: true })).toEqual([
      "ActiveModel::API#initialize is inlined untagged: ActiveRecord::Base reaches it from another Ruby file",
    ]);
  });

  it("skips an index re-export under an alias, whose constructor sits in another file", () => {
    const enrolled = ["activerecord"];
    expect(
      messages([LAST, NEW, FIRST, CORE, API], {
        enrolled,
        reexport: true,
        alias: "DatabaseAdapter",
      }),
    ).toEqual([]);
  });

  it("pairs a renamed class with the one Rails class of its mirrored file", () => {
    const enrolled = ["activerecord"];
    expect(messages([LAST, NEW, FIRST, CORE, API], { owner: "BaseRecord", enrolled })).toEqual([]);
    expect(messages([CORE], { owner: "ProxyRecord", file: "proxy.ts" })).toEqual([
      "ActiveRecord::Core#initialize names a module ActiveRecord::Proxy does not include or prepend",
    ]);
  });

  it("ends the chain at an initialize that calls no super", () => {
    const enrolled = ["activerecord"];
    expect(messages([], { owner: "Proxy", file: "proxy.ts", enrolled })).toEqual([]);
    expect(messages([CORE], { owner: "Proxy", file: "proxy.ts" })).toEqual([
      "ActiveRecord::Core#initialize names a module ActiveRecord::Proxy does not include or prepend",
    ]);
    expect(messages([], { owner: "Spanless", file: "spanless.ts", enrolled })).toEqual([
      "ActiveRecord::Core#initialize is inlined untagged: ActiveRecord::Spanless reaches it from another Ruby file",
    ]);
    expect(messages([], { owner: "Session", file: "session.ts", enrolled })).toEqual([
      "ActiveRecord::Core#initialize is inlined untagged: ActiveRecord::Session reaches it from another Ruby file",
    ]);
  });
});
