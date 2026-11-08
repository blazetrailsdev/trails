import { constSet } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { RealModName } from "./real-mod-name.js";

const { realModName } = RealModName;

describe("TestRealModName", () => {
  it("returns nil for anonymous classes and modules", () => {
    for (const mod of [class {}, {}]) expect(realModName(mod)).toBeNull();
  });

  // PERMANENT-SKIP: `rbModName` reads a JS function's `name` for an unseated class (`packages/ruby-compat/lib/object.ts`), the only name it has, so an override cannot be told from it.
  it.skip("returns nil for anonymous classes and modules that override #name", () => {});

  class TestRealModName {}

  it("returns the name of regular classes an modules", () => {
    const C = class {};
    const M = {};
    for (const [name, mod] of Object.entries({ C, M })) constSet(TestRealModName, name, mod);
    for (const [mod, name] of [
      [C, "C"],
      [M, "M"],
    ] as const) {
      expect(realModName(mod)).toEqual(`TestRealModName::${name}`);
    }
  });

  it("returns the real name of class and modules that override #name", () => {
    const C = class {
      static get name() {
        return "X";
      }
    };
    const M = { name: "X" };
    for (const [name, mod] of Object.entries({ C2: C, M2: M }))
      constSet(TestRealModName, name, mod);
    for (const [mod, name] of [
      [C, "C2"],
      [M, "M2"],
    ] as const) {
      expect((mod as { name: string }).name).toEqual("X");
      expect(realModName(mod)).toEqual(`TestRealModName::${name}`);
    }
  });
});
