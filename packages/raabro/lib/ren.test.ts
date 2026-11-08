import "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".ren", () => {
    it("returns the tree coming from the wrapped parser", () => {
      const i = new Input("ta");

      const t = Raabro.ren("renamed", i, ":nta");

      expect(t.toA({ leaves: true })).toEqual(["renamed", 1, 0, 2, null, ":str", "ta"]);
      expect(i.offset).toEqual(2);
    });
  });

  describe(".rename", () => {
    it("is an alias to .ren", () => {
      const i = new Input("ta");

      const t = Raabro.rename("autre", i, ":nta");

      expect(t.toA({ leaves: true })).toEqual(["autre", 1, 0, 2, null, ":str", "ta"]);
      expect(i.offset).toEqual(2);
    });
  });
});
