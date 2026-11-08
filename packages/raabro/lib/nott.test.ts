import "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".nott", () => {
    it("hits", () => {
      const i = new Input("to");
      const t = Raabro.nott(":no0", i, ":ta");

      expect(t.toA({ leaves: true })).toEqual([
        ":no0",
        1,
        0,
        0,
        null,
        ":nott",
        [[null, 0, 0, 0, null, ":str", []]],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("misses", () => {
      const i = new Input("ta");
      const t = Raabro.nott(":no0", i, ":ta");

      expect(t.toA({ leaves: true })).toEqual([
        ":no0",
        0,
        0,
        0,
        null,
        ":nott",
        [[null, 1, 0, 2, null, ":str", "ta"]],
      ]);
      expect(i.offset).toEqual(0);
    });
  });
});
