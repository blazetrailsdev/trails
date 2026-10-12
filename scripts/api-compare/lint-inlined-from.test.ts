import { describe, expect, it } from "vitest";
import type { ApiManifest, InlinedFrom, MethodInfo } from "@blazetrails/parity/types";
import { MISSING_TAG_PACKAGES, fixCitations, inlinedFromFindings } from "./lint-inlined-from.js";

const def = (name: string, vendorFile: string, line: number, endLine: number): MethodInfo =>
  ({ name, visibility: "public", params: [], vendorFile, line, endLine }) as MethodInfo;

function entity(
  file: string,
  instanceMethods: MethodInfo[] = [],
  mixins: { includes?: string[]; prepends?: string[]; extends?: string[] } = {},
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
        }),
        "ActiveRecord::Relation": entity("relation.rb"),
      },
      modules: {
        "ActiveRecord::Core": entity("core.rb", [def("initialize", `${AR}/core.rb`, 471, 482)]),
        "ActiveRecord::Inheritance": entity("inheritance.rb", [], CONCERN),
        "ActiveRecord::Plain": entity("plain.rb"),
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
    hook: hook as InlinedFrom["hook"],
    source,
    version,
    file,
    firstLine: Number(first),
    lastLine: Number(last),
  };
};

const NEW = tag("ActiveRecord::Inheritance::ClassMethods#new", `${AR}/inheritance.rb:56-78`);
const CORE = tag("ActiveRecord::Core#initialize", `${AR}/core.rb:471-482`);
const API = tag("ActiveModel::API#initialize", `${AM}/api.rb:80-84`);

function messages(
  inlinedFrom: InlinedFrom[],
  { owner = "Base", file = "base.ts", enrolled = [] as string[] } = {},
): string[] {
  const ctor = { ...def("constructor", "", 1, 1), file, inlinedFrom };
  const ts = {
    packages: { activerecord: { classes: { [owner]: entity(file, [ctor]) }, modules: {} } },
  } as unknown as ApiManifest;
  return inlinedFromFindings(ruby, ts, enrolled).map((f) => `${f.hook} ${f.message}`);
}

describe("inlinedFromFindings", () => {
  it("passes a constructor tagged for each cross-file hook its Rails class reaches", () => {
    expect(messages([NEW, CORE, API], { enrolled: ["activerecord"] })).toEqual([]);
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
    expect(messages([plain, NEW, CORE, API], { enrolled: ["activerecord"] })).toEqual([
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

  it("flags a tag on a constructor that mirrors no Rails class", () => {
    expect(messages([CORE], { owner: "Helper" })[0]).toContain("mirror no Rails class or module");
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
    expect(messages([CORE], { enrolled: ["activerecord"] })).toEqual([
      "ActiveRecord::Inheritance::ClassMethods#new is inlined untagged: ActiveRecord::Base reaches it from another Ruby file",
      "ActiveModel::API#initialize is inlined untagged: ActiveRecord::Base reaches it from another Ruby file",
    ]);
  });

  it("leaves the missing-tag arm off for a package that is not enrolled", () => {
    expect(messages([])).toEqual([]);
    expect(MISSING_TAG_PACKAGES).toEqual([]);
  });
});
