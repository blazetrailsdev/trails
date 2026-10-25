import "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".rep", () => {
    it("returns a tree with result == 0 in case of failure", () => {
      const i = new Input("toto");

      const t = Raabro.rep(":x", i, ":to", 3, 4);

      expect(t.toA({ leaves: true })).toEqual([
        ":x",
        0,
        0,
        0,
        null,
        ":rep",
        [
          [null, 1, 0, 2, null, ":str", "to"],
          [null, 1, 2, 2, null, ":str", "to"],
          [null, 0, 4, 0, null, ":str", []],
        ],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("prunes", () => {
      const i = new Input("toto", { prune: true });

      const t = Raabro.rep(":x", i, ":to", 3, 4);

      expect(t.toA({ leaves: true })).toEqual([
        ":x",
        0,
        0,
        0,
        null,
        ":rep",
        [
          [null, 1, 0, 2, null, ":str", "to"],
          [null, 1, 2, 2, null, ":str", "to"],
        ],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("fails (min not reached)", () => {
      const i = new Input("toto");

      const t = Raabro.rep(":x", i, ":to", 3);

      expect(t.toA({ leaves: true })).toEqual([
        ":x",
        0,
        0,
        0,
        null,
        ":rep",
        [
          [null, 1, 0, 2, null, ":str", "to"],
          [null, 1, 2, 2, null, ":str", "to"],
          [null, 0, 4, 0, null, ":str", []],
        ],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("succeeds (max set)", () => {
      const i = new Input("tototo");

      const t = Raabro.rep(":x", i, ":to", 1, 2);

      expect(t.toA({ leaves: true })).toEqual([
        ":x",
        1,
        0,
        4,
        null,
        ":rep",
        [
          [null, 1, 0, 2, null, ":str", "to"],
          [null, 1, 2, 2, null, ":str", "to"],
        ],
      ]);
      expect(i.offset).toEqual(4);
    });

    it("succeeds (max not set)", () => {
      const i = new Input("toto");

      const t = Raabro.rep(":x", i, ":to", 1);

      expect(t.toA({ leaves: true })).toEqual([
        ":x",
        1,
        0,
        4,
        null,
        ":rep",
        [
          [null, 1, 0, 2, null, ":str", "to"],
          [null, 1, 2, 2, null, ":str", "to"],
          [null, 0, 4, 0, null, ":str", []],
        ],
      ]);
      expect(i.offset).toEqual(4);
    });
  });
});
