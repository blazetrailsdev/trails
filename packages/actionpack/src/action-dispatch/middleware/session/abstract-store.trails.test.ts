import { describe, expect, it } from "vitest";
import { ArgumentError, registerConstant, unregisterConstant } from "@blazetrails/ruby-compat";
import { StaleSessionCheck } from "./abstract-store.js";

describe("AbstractStore", () => {
  describe("StaleSessionCheck.staleSessionCheckBang", () => {
    it("retries the block once the class it names resolves", () => {
      class Loadable {}
      registerConstant("StaleSessionCheckLoadable", Loadable);
      let calls = 0;
      try {
        expect(
          StaleSessionCheck.staleSessionCheckBang(() => {
            calls += 1;
            if (calls === 1) {
              throw new ArgumentError("undefined class/module StaleSessionCheckLoadable");
            }
            return calls;
          }),
        ).toBe(2);
      } finally {
        unregisterConstant("StaleSessionCheckLoadable", Loadable);
      }
    });

    it("re-raises an error that is not an ArgumentError, whatever its message", () => {
      const err = new Error("undefined class/module Acme::Missing");
      expect(() =>
        StaleSessionCheck.staleSessionCheckBang(() => {
          throw err;
        }),
      ).toThrow(err);
    });
  });
});
