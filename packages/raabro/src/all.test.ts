import "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".all", () => {
    it("fails when not all the input is consumed", () => {
      const i = new Input("tototota");

      const t = Raabro.all(null, i, ":toPlus");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        0,
        0,
        0,
        null,
        ":all",
        [
          [
            ":tos",
            1,
            0,
            6,
            null,
            ":rep",
            [
              [null, 1, 0, 2, null, ":str", "to"],
              [null, 1, 2, 2, null, ":str", "to"],
              [null, 1, 4, 2, null, ":str", "to"],
              [null, 0, 6, 0, null, ":str", []],
            ],
          ],
        ],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("succeeds when all the input is consumed", () => {
      const i = new Input("tototo");

      const t = Raabro.all(null, i, ":toPlus");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        6,
        null,
        ":all",
        [
          [
            ":tos",
            1,
            0,
            6,
            null,
            ":rep",
            [
              [null, 1, 0, 2, null, ":str", "to"],
              [null, 1, 2, 2, null, ":str", "to"],
              [null, 1, 4, 2, null, ":str", "to"],
              [null, 0, 6, 0, null, ":str", []],
            ],
          ],
        ],
      ]);
      expect(i.offset).toEqual(6);
    });
  });
});
