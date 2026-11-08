import "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".jseq", () => {
    it("parses elts joined by a separator", () => {
      const i = new Input("a,b,c");

      const t = Raabro.jseq(":j", i, ":cha", ":com");

      expect(t.toA({ leaves: true })).toEqual([
        ":j",
        1,
        0,
        5,
        null,
        ":jseq",
        [
          [null, 1, 0, 1, null, ":rex", "a"],
          [null, 1, 1, 1, null, ":str", ","],
          [null, 1, 2, 1, null, ":rex", "b"],
          [null, 1, 3, 1, null, ":str", ","],
          [null, 1, 4, 1, null, ":rex", "c"],
          [null, 0, 5, 0, null, ":str", []],
        ],
      ]);
      expect(i.offset).toEqual(5);
    });

    it("prunes", () => {
      const i = new Input("a,b,c", { prune: true });

      const t = Raabro.jseq(":j", i, ":cha", ":com");

      expect(t.toA({ leaves: true })).toEqual([
        ":j",
        1,
        0,
        5,
        null,
        ":jseq",
        [
          [null, 1, 0, 1, null, ":rex", "a"],
          [null, 1, 1, 1, null, ":str", ","],
          [null, 1, 2, 1, null, ":rex", "b"],
          [null, 1, 3, 1, null, ":str", ","],
          [null, 1, 4, 1, null, ":rex", "c"],
        ],
      ]);
      expect(i.offset).toEqual(5);
    });

    it("fails when 0 elements", () => {
      const i = new Input("");

      const t = Raabro.jseq(":j", i, ":cha", ":com");

      expect(t.toA({ leaves: true })).toEqual([
        ":j",
        0,
        0,
        0,
        null,
        ":jseq",
        [[null, 0, 0, 0, null, ":rex", []]],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("does not include trailing separators", () => {
      const i = new Input("a,b,", { prune: false });

      const t = Raabro.jseq(":j", i, ":cha", ":com");

      expect(t.toA({ leaves: true })).toEqual([
        ":j",
        1,
        0,
        3,
        null,
        ":jseq",
        [
          [null, 1, 0, 1, null, ":rex", "a"],
          [null, 1, 1, 1, null, ":str", ","],
          [null, 1, 2, 1, null, ":rex", "b"],
          [null, 0, 3, 1, null, ":str", []],
          [null, 0, 4, 0, null, ":rex", []],
        ],
      ]);
    });
  });
});
