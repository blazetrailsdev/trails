import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InlinedFrom, MethodInfo } from "@blazetrails/parity/types";

const output = vi.hoisted(() => ({ dir: "" }));
vi.mock("./config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./config.js")>()),
  get OUTPUT_DIR() {
    return output.dir;
  },
}));

import { main } from "./compare.js";

const PKG = "activemodel";
const API_RB = "rails/v8.0.2/activemodel/lib/active_model/api.rb";

function method(name: string, calls: string[], extra: Partial<MethodInfo> = {}): MethodInfo {
  return {
    name,
    visibility: "public",
    params: [],
    calls,
    callArgs: calls.map((call) => ({ name: call, args: [], flags: [] })),
    ...extra,
  } as MethodInfo;
}

const PARAMS: MethodInfo["params"] = [{ name: "attributes", kind: "required" }];

function entity(fqn: string, file: string, instanceMethods: MethodInfo[], includes: string[] = []) {
  const name = fqn.split("::").pop();
  return {
    name,
    fqn,
    file,
    superclass: null,
    includes,
    extends: [],
    instanceMethods,
    classMethods: [],
  };
}

const tag = (overrides: Partial<InlinedFrom> = {}): InlinedFrom => ({
  module: "ActiveModel::API",
  hook: "initialize",
  source: "rails",
  version: "v8.0.2",
  file: "activemodel/lib/active_model/api.rb",
  firstLine: 80,
  lastLine: 84,
  ...overrides,
});

function compare({
  tsCalls = ["buildReflection", "assignAttributes", "super"],
  inlinedFrom = [tag()],
  rubyInitialize = true,
  sameFileModule = false,
  rubyClass = true,
  moduleFile = "api.rb",
  rubyNew = false,
  classMethodsNew = false,
}: {
  tsCalls?: string[];
  inlinedFrom?: InlinedFrom[];
  rubyInitialize?: boolean;
  sameFileModule?: boolean;
  rubyClass?: boolean;
  moduleFile?: string;
  rubyNew?: boolean;
  classMethodsNew?: boolean;
} = {}): { calls: string[]; args: string[] } {
  const write = (name: string, packages: unknown) =>
    fs.writeFileSync(path.join(output.dir, name), JSON.stringify({ packages }));
  const helpers = (names: string[]) => names.map((name) => method(name, [], { params: PARAMS }));
  const cited = (line: number, endLine: number) => ({ vendorFile: API_RB, line, endLine });
  const local = entity("ActiveModel::Thing::Local", "thing.rb", [
    method("initialize", ["super"], cited(1, 2)),
  ]);
  const thing = {
    "ActiveModel::Thing": {
      ...entity(
        "ActiveModel::Thing",
        "thing.rb",
        [
          method(rubyInitialize ? "initialize" : "reflect", ["build_reflection", "super"]),
          ...helpers(["assign_attributes", "build_reflection", "lookup_reflection"]),
        ],
        rubyInitialize
          ? [
              "ActiveModel::API",
              ...(sameFileModule ? ["Local"] : []),
              ...(classMethodsNew ? ["ActiveModel::Naming"] : []),
            ]
          : [],
      ),
      classMethods: rubyNew ? [method("new", ["lookup_reflection", "super"])] : [],
    },
  };
  write("rails-api.json", {
    [PKG]: {
      classes: rubyClass ? thing : {},
      modules: {
        ...(rubyClass ? {} : thing),
        "ActiveModel::API": entity("ActiveModel::API", moduleFile, [
          method("initialize", ["assign_attributes", "super"], cited(80, 84)),
        ]),
        ...(sameFileModule ? { "ActiveModel::Thing::Local": local } : {}),
        ...(classMethodsNew
          ? {
              "ActiveModel::Naming": entity("ActiveModel::Naming", "naming.rb", []),
              "ActiveModel::Naming::ClassMethods": entity(
                "ActiveModel::Naming::ClassMethods",
                "naming.rb",
                [method("new", ["lookup_reflection", "super"], cited(13, 15))],
              ),
            }
          : {}),
      },
    },
  });
  const tsMethods = [
    ...(rubyInitialize ? [] : [method("reflect", tsCalls)]),
    method("constructor", tsCalls, { inlinedFrom }),
    ...helpers(["assignAttributes", "buildReflection", "lookupReflection"]),
  ].map((m, index) => ({ ...m, file: "thing.ts", line: 3 + index * 5 }));
  write("ts-api.json", {
    [PKG]: { classes: { Thing: entity("Thing", "thing.ts", tsMethods) }, modules: {} },
  });
  main();
  const rows = (name: string): string[] =>
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(output.dir, name), "utf-8")), null, 1)
      .split("\n")
      .filter((line) => line.includes("thing.ts") || line.includes("→"));
  return { calls: rows("call-mismatches.json"), args: rows("call-arg-mismatches.json") };
}

/**
 * The module's own row of the comparison, with the module in a file no
 * `SCOPED_SKIP_GROUPS` entry names (`api.rb` is one of the three).
 */
function moduleRow(fixture: Parameters<typeof compare>[0] = {}) {
  compare({ ...fixture, moduleFile: "validations.rb" });
  const report = JSON.parse(fs.readFileSync(path.join(output.dir, "api-comparison.json"), "utf-8"));
  return report.results[0].files.find(
    (file: { rubyFile: string }) => file.rubyFile === "validations.rb",
  );
}

describe("compare.ts --calls over a constructor carrying @inlinedFrom", () => {
  const argv = process.argv;

  beforeEach(() => {
    output.dir = fs.mkdtempSync(path.join(os.tmpdir(), "compare-inlined-"));
    process.argv = ["node", "compare-under-test", "--calls", "--package", PKG];
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
    fs.rmSync(output.dir, { recursive: true, force: true });
  });

  it("flags a call only the tagged module body makes when the constructor omits it", () => {
    const { calls } = compare({ tsCalls: ["buildReflection", "super"] });
    expect(calls.join("\n")).toContain("assign_attributes → assignAttributes");
    expect(calls.join("\n")).not.toContain("build_reflection");
  });

  it("flags nothing when the constructor makes the union's calls", () => {
    expect(compare()).toEqual({ calls: [], args: [] });
  });

  it("compares a class with no Rails initialize of its own against the tagged chain alone", () => {
    const { calls } = compare({ rubyInitialize: false, tsCalls: ["buildReflection", "super"] });
    expect(calls.join("\n")).toContain("assign_attributes → assignAttributes");
    expect(compare({ rubyInitialize: false })).toEqual({ calls: [], args: [] });
  });

  it("scores the module's initialize as matched through the tag, with nothing to relocate", () => {
    expect(moduleRow()).toMatchObject({ matched: 1, missing: 0, moves: [] });
  });

  it("still reports an untagged includer's constructor as a method to relocate", () => {
    expect(moduleRow({ inlinedFrom: [] })).toMatchObject({
      matched: 1,
      moves: [{ rubyName: "initialize", actualFile: "thing.ts" }],
    });
  });

  const naming = tag({ module: "ActiveModel::Naming::ClassMethods", hook: "new", firstLine: 13 });
  const namingRow = (inlinedFrom: InlinedFrom[]) => {
    compare({ classMethodsNew: true, inlinedFrom });
    const report = JSON.parse(
      fs.readFileSync(path.join(output.dir, "api-comparison.json"), "utf-8"),
    );
    return report.results[0].files.find(
      (file: { rubyFile: string }) => file.rubyFile === "naming.rb",
    );
  };

  it("scores a ClassMethods#new as matched through its tag, with nothing to relocate", () => {
    expect(namingRow([tag(), { ...naming, lastLine: 15 }])).toMatchObject({
      matched: 1,
      missing: 0,
      moves: [],
    });
  });

  it("still reports an untagged ClassMethods#new on the includer's constructor as one to relocate", () => {
    expect(namingRow([tag()])).toMatchObject({
      matched: 1,
      moves: [{ rubyName: "new", actualFile: "thing.ts" }],
    });
  });

  it("compares the constructor against the class's own self.new, then initialize", () => {
    const { calls } = compare({ rubyNew: true });
    expect(calls.join("\n")).toContain("lookup_reflection → lookupReflection");
    expect(
      compare({
        rubyNew: true,
        tsCalls: ["lookupReflection", "buildReflection", "assignAttributes", "super"],
      }),
    ).toEqual({ calls: [], args: [] });
  });

  const local = tag({ module: "ActiveModel::Thing::Local", firstLine: 1, lastLine: 2 });
  it.each([
    ["a stale citation", "citation is stale", { inlinedFrom: [tag({ firstLine: 81 })] }],
    ["an unresolvable tag", "names no Ruby body", { inlinedFrom: [tag({ module: "A::Missing" })] }],
    ["a same-file tag", "is redundant", { inlinedFrom: [local], sameFileModule: true }],
    [
      "an unpaired constructor",
      "was never compared, no Rails `initialize` paired",
      {
        rubyInitialize: false,
        rubyClass: false,
      },
    ],
  ])("throws its own message on %s", (_what, message, fixture) => {
    expect(() => compare(fixture)).toThrow(
      new RegExp(`^@inlinedFrom ${message}: activemodel/thing\\.ts Thing#constructor`),
    );
  });
});
