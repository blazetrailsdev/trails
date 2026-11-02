import { constSet } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { RealModName } from "./real-mod-name.js";

const { realModName } = RealModName;

describe("TestRealModName", () => {
  it("returns nil for anonymous classes and modules", () => {
    for (const mod of [class {}, {}]) expect(realModName(mod)).toBeNull();
  });

  // PERMANENT-SKIP: `rbModName` reads a JS function's `name` for an unseated class (`packages/ruby-compat/src/object.ts`), the only name it has, so an override cannot be told from it.
  it.skip("returns nil for anonymous classes and modules that override #name", () => {});

  class TestRealModName {}

  it("returns the name of regular classes an modules", () => {
    const C = class {};
    const M = {};
    constSet(TestRealModName, "C", C);
    constSet(TestRealModName, "M", M);
    expect(realModName(C)).toEqual("TestRealModName::C");
    expect(realModName(M)).toEqual("TestRealModName::M");
  });

  it("returns the real name of class and modules that override #name", () => {
    const C = class {
      static get name() {
        return "X";
      }
    };
    const M = { name: "X" };
    constSet(TestRealModName, "C2", C);
    constSet(TestRealModName, "M2", M);
    expect(realModName(C)).toEqual("TestRealModName::C2");
    expect(realModName(M)).toEqual("TestRealModName::M2");
  });
});
