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

const PARAMS = [{ name: "attributes", kind: "req" }] as MethodInfo["params"];

function entity(name: string, file: string, instanceMethods: MethodInfo[], includes: string[]) {
  return { name, file, superclass: null, includes, extends: [], instanceMethods, classMethods: [] };
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

interface Fixture {
  tsCalls?: string[];
  inlinedFrom?: InlinedFrom[];
  rubyInitialize?: boolean;
  sameFileModule?: boolean;
}

/** Runs `compare.ts --calls` over a two-file package and returns its call rows. */
function compare({
  tsCalls = ["buildReflection", "assignAttributes", "super"],
  inlinedFrom = [tag()],
  rubyInitialize = true,
  sameFileModule = false,
}: Fixture = {}): { calls: string[]; args: string[] } {
  const write = (name: string, packages: unknown) =>
    fs.writeFileSync(path.join(output.dir, name), JSON.stringify({ packages }));
  write("rails-api.json", {
    [PKG]: {
      classes: {
        "ActiveModel::Thing": {
          ...entity(
            "Thing",
            "thing.rb",
            [
              method(rubyInitialize ? "initialize" : "reflect", ["build_reflection", "super"]),
              method("assign_attributes", [], { params: PARAMS }),
              method("build_reflection", [], { params: PARAMS }),
            ],
            rubyInitialize ? ["ActiveModel::API", ...(sameFileModule ? ["Local"] : [])] : [],
          ),
          fqn: "ActiveModel::Thing",
        },
      },
      modules: {
        "ActiveModel::API": {
          ...entity(
            "API",
            "api.rb",
            [
              method("initialize", ["assign_attributes", "super"], {
                vendorFile: API_RB,
                line: 80,
                endLine: 84,
              }),
            ],
            [],
          ),
          fqn: "ActiveModel::API",
        },
        ...(sameFileModule
          ? {
              "ActiveModel::Thing::Local": {
                ...entity(
                  "Local",
                  "thing.rb",
                  [method("initialize", ["super"], { vendorFile: API_RB, line: 1, endLine: 2 })],
                  [],
                ),
                fqn: "ActiveModel::Thing::Local",
              },
            }
          : {}),
      },
    },
  });
  write("ts-api.json", {
    [PKG]: {
      classes: {
        Thing: entity(
          "Thing",
          "thing.ts",
          [
            method(rubyInitialize ? "constructor" : "reflect", tsCalls, { inlinedFrom }),
            ...(rubyInitialize ? [] : [method("constructor", tsCalls, { inlinedFrom })]),
            method("assignAttributes", [], { params: PARAMS }),
            method("buildReflection", [], { params: PARAMS }),
          ].map((m, index) => ({ ...m, file: "thing.ts", line: 3 + index * 5 })),
          [],
        ),
      },
      modules: {},
    },
  });
  main();
  const rows = (name: string): string[] =>
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(output.dir, name), "utf-8")), null, 1)
      .split("\n")
      .filter((line) => line.includes("thing.ts") || line.includes("→"));
  return { calls: rows("call-mismatches.json"), args: rows("call-arg-mismatches.json") };
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
    expect(compare().calls).toEqual([]);
  });

  it("does not flag the super the inlining consumed", () => {
    const { calls, args } = compare({ tsCalls: ["buildReflection", "assignAttributes"] });
    expect([...calls, ...args].join("\n")).not.toContain("super");
  });

  it("throws on a stale citation", () => {
    expect(() => compare({ inlinedFrom: [tag({ firstLine: 81 })] })).toThrow(
      /@inlinedFrom citation is stale: activemodel\/thing\.ts Thing#constructor/,
    );
  });

  it("throws on a tag that resolves to no Ruby body", () => {
    expect(() => compare({ inlinedFrom: [tag({ module: "ActiveModel::Missing" })] })).toThrow(
      /@inlinedFrom names no Ruby body: activemodel\/thing\.ts Thing#constructor/,
    );
  });

  it("throws on a tag naming a same-file module", () => {
    const sameFile = tag({ module: "ActiveModel::Thing::Local", firstLine: 1, lastLine: 2 });
    expect(() => compare({ inlinedFrom: [sameFile], sameFileModule: true })).toThrow(
      /@inlinedFrom is redundant: activemodel\/thing\.ts Thing#constructor/,
    );
  });

  it("throws on a tag sitting on a constructor no Rails initialize paired", () => {
    expect(() => compare({ rubyInitialize: false })).toThrow(
      "@inlinedFrom was never compared, no Rails `initialize` paired: " +
        "activemodel/thing.ts Thing#constructor",
    );
  });
});
