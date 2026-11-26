import { describe, expect, it } from "vitest";
import { isModuleIncluded, rbObjIsKindOf } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { rbModRemoveConst } from "@blazetrails/ruby-compat/variable";
import { Concern } from "../../../lib/concern.js";
import { concern } from "../../../lib/core-ext/kernel/concern.js";
import { assertNot } from "../../../lib/testing/assertions.js";

describe("KernelConcernTest", () => {
  it("may be defined at toplevel", () => {
    try {
      const mod = concern("ToplevelConcern", () => {});
      expect((TopLevel as Record<string, unknown>).ToplevelConcern).toBe(mod);
      expect(rbObjIsKindOf(mod, Concern)).toBe(true);
      assertNot(isModuleIncluded(Object, mod));
    } finally {
      rbModRemoveConst(Object, "ToplevelConcern");
    }
  });
});
