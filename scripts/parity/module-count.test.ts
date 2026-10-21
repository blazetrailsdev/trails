import { describe, expect, it } from "vitest";
import { countText, exceedances, main, tighten } from "./module-count.js";

describe("module-count", () => {
  it("counts new Module, superMethod and a Module import, multi-line imports once", () => {
    const text = [
      "import {",
      "  include,",
      "  Module,",
      '} from "@blazetrails/ruby-compat";',
      'import { type Module as M } from "@blazetrails/ruby-compat";',
      'import { ModuleError } from "@blazetrails/ruby-compat";',
      "const mod = new Module();",
      'mod.superMethod(this, "foo")!();',
    ].join("\n");
    expect(countText(text)).toEqual({ newModule: 1, superMethod: 1, moduleImport: 2 });
  });

  it("flags a rise, including a package with no mark row", () => {
    const marks = { a: { newModule: 2, superMethod: 0, moduleImport: 1 } };
    const current = {
      a: { newModule: 3, superMethod: 0, moduleImport: 1 },
      b: { newModule: 0, superMethod: 1, moduleImport: 0 },
    };
    expect(exceedances(marks, current)).toEqual([
      { pkg: "a", kind: "newModule", mark: 2, current: 3 },
      { pkg: "b", kind: "superMethod", mark: 0, current: 1 },
    ]);
  });

  it("tightens marks down only and drops a burnt-down row", () => {
    const marks = {
      a: { newModule: 2, superMethod: 1, moduleImport: 1 },
      b: { newModule: 1, superMethod: 0, moduleImport: 0 },
    };
    const current = { a: { newModule: 5, superMethod: 0, moduleImport: 1 } };
    expect(tighten(marks, current)).toEqual({
      a: { newModule: 2, superMethod: 0, moduleImport: 1 },
    });
  });

  it("passes on the working tree", async () => {
    await expect(main()).resolves.toMatch(/^module-count gate: OK/);
  });
});
