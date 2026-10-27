import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MethodInfo } from "@blazetrails/parity/types";

const output = vi.hoisted(() => ({ dir: "" }));
vi.mock("./config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./config.js")>()),
  get OUTPUT_DIR() {
    return output.dir;
  },
}));

import { main } from "./compare.js";

const PKG = "activemodel";

const PARAMS: MethodInfo["params"] = [{ name: "code", kind: "required" }];

function method(name: string, calls: string[]): MethodInfo {
  return {
    name,
    visibility: "public",
    params: name === "eval_code" || name === "evalCode" ? PARAMS : [],
    calls,
    callArgs: calls.map((call) => ({ name: call, args: [], flags: [] })),
  } as MethodInfo;
}

function entity(fqn: string, file: string, instanceMethods: MethodInfo[]) {
  return {
    name: fqn.split("::").pop(),
    fqn,
    file,
    superclass: null,
    includes: [],
    extends: [],
    instanceMethods,
    classMethods: [],
  };
}

/**
 * `naming.rb` is ported as `naming.ts`; `runner.rb` is not, and its
 * `perform` / `help` / `banner` land the misplaced guess on `naming.ts`
 * (trails#8838, `Rails::Command::DbconsoleCommand#perform`).
 */
function callRows(): unknown[] {
  const write = (name: string, packages: unknown) =>
    fs.writeFileSync(path.join(output.dir, name), JSON.stringify({ packages }));
  const names = ["perform", "help", "banner"];
  write("rails-api.json", {
    [PKG]: {
      classes: {
        "ActiveModel::Naming": entity(
          "ActiveModel::Naming",
          "naming.rb",
          names.map((n) => method(n, ["start"])),
        ),
        "ActiveModel::Runner": entity("ActiveModel::Runner", "runner.rb", [
          ...names.map((n) => method(n, ["eval_code"])),
          method("eval_code", []),
        ]),
      },
      modules: {},
    },
  });
  const tsMethods = [...names, "start", "evalCode"].map((n, index) => ({
    ...method(n, names.includes(n) ? ["start"] : []),
    file: "naming.ts",
    line: 3 + index * 5,
  }));
  write("ts-api.json", {
    [PKG]: {
      classes: { Naming: entity("Naming", "naming.ts", tsMethods) },
      modules: {},
    },
  });
  main();
  return JSON.parse(fs.readFileSync(path.join(output.dir, "call-mismatches.json"), "utf-8"))
    .mismatches;
}

describe("compare.ts --calls over an unported file guessed onto another file's mirror", () => {
  const argv = process.argv;

  beforeEach(() => {
    output.dir = fs.mkdtempSync(path.join(os.tmpdir(), "compare-guessed-mirror-"));
    process.argv = ["node", "compare-under-test", "--calls", "--package", PKG];
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
    fs.rmSync(output.dir, { recursive: true, force: true });
  });

  it("skips the call gates for a name the mirrored Ruby file defines", () => {
    expect(callRows()).toEqual([]);
  });
});
