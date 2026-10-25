import { arr } from "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".eseq", () => {
    it("parses successfully", () => {
      const i = new Input("<a,b>");

      const t = Raabro.eseq(":list", i, ":lt", ":cha", ":com", ":gt");

      expect(t.toA({ leaves: true })).toEqual([
        ":list",
        1,
        0,
        5,
        null,
        ":eseq",
        [
          [null, 1, 0, 1, null, ":str", "<"],
          [null, 1, 1, 1, null, ":rex", "a"],
          [null, 1, 2, 1, null, ":str", ","],
          [null, 1, 3, 1, null, ":rex", "b"],
          [null, 0, 4, 0, null, ":str", []],
          [null, 1, 4, 1, null, ":str", ">"],
        ],
      ]);
      expect(i.offset).toEqual(5);
    });

    it("prunes", () => {
      const i = new Input("<a,b>", { prune: true });

      const t = Raabro.eseq(":list", i, ":lt", ":cha", ":com", ":gt");

      expect(t.toA({ leaves: true })).toEqual([
        ":list",
        1,
        0,
        5,
        null,
        ":eseq",
        [
          [null, 1, 0, 1, null, ":str", "<"],
          [null, 1, 1, 1, null, ":rex", "a"],
          [null, 1, 2, 1, null, ":str", ","],
          [null, 1, 3, 1, null, ":rex", "b"],
          [null, 1, 4, 1, null, ":str", ">"],
        ],
      ]);
      expect(i.offset).toEqual(5);
    });

    it("parses <>", () => {
      const i = new Input("<>", { prune: true });

      const t = Raabro.eseq(":list", i, ":lt", ":cha", ":com", ":gt");

      expect(t.toA({ leaves: true })).toEqual([
        ":list",
        1,
        0,
        2,
        null,
        ":eseq",
        [
          [null, 1, 0, 1, null, ":str", "<"],
          [null, 1, 1, 1, null, ":str", ">"],
        ],
      ]);
      expect(i.offset).toEqual(2);
    });

    describe("no start parser", () => {
      it("parses successfully", () => {
        const i = new Input("a,b>", { prune: false });

        const t = Raabro.eseq(":list", i, null, ":cha", ":com", ":gt");

        expect(t.toA({ leaves: true })).toEqual([
          ":list",
          1,
          0,
          4,
          null,
          ":eseq",
          [
            [null, 1, 0, 1, null, ":rex", "a"],
            [null, 1, 1, 1, null, ":str", ","],
            [null, 1, 2, 1, null, ":rex", "b"],
            [null, 0, 3, 0, null, ":str", []],
            [null, 1, 3, 1, null, ":str", ">"],
          ],
        ]);
        expect(i.offset).toEqual(4);
      });
    });

    describe("no end parser", () => {
      it("parses successfully", () => {
        const i = new Input("<a,b");

        const t = Raabro.eseq(":list", i, ":lt", ":cha", ":com", null);

        expect(t.toA({ leaves: true })).toEqual([
          ":list",
          1,
          0,
          4,
          null,
          ":eseq",
          [
            [null, 1, 0, 1, null, ":str", "<"],
            [null, 1, 1, 1, null, ":rex", "a"],
            [null, 1, 2, 1, null, ":str", ","],
            [null, 1, 3, 1, null, ":rex", "b"],
            [null, 0, 4, 0, null, ":str", []],
          ],
        ]);
        expect(i.offset).toEqual(4);
      });

      it("prunes", () => {
        const i = new Input("<a,b", { prune: true });

        const t = Raabro.eseq(":list", i, ":lt", ":cha", ":com", null);

        expect(t.toA({ leaves: true })).toEqual([
          ":list",
          1,
          0,
          4,
          null,
          ":eseq",
          [
            [null, 1, 0, 1, null, ":str", "<"],
            [null, 1, 1, 1, null, ":rex", "a"],
            [null, 1, 2, 1, null, ":str", ","],
            [null, 1, 3, 1, null, ":rex", "b"],
          ],
        ]);
        expect(i.offset).toEqual(4);
      });
    });

    describe("no progress", () => {
      it("parses <>", () => {
        const i = new Input("<>", { prune: true });

        const t = arr(i);

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          2,
          null,
          ":eseq",
          [
            [null, 1, 0, 1, null, ":str", "<"],
            [null, 1, 1, 0, null, ":rex", ""],
            [null, 1, 1, 1, null, ":str", ">"],
          ],
        ]);
        expect(i.offset).toEqual(2);
      });

      it("parses <a,,a>", () => {
        const i = new Input("<a,,a>", { prune: true });

        const t = arr(i);

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          6,
          null,
          ":eseq",
          [
            [null, 1, 0, 1, null, ":str", "<"],
            [null, 1, 1, 1, null, ":rex", "a"],
            [null, 1, 2, 1, null, ":rex", ","],
            [null, 1, 3, 0, null, ":rex", ""],
            [null, 1, 3, 1, null, ":rex", ","],
            [null, 1, 4, 1, null, ":rex", "a"],
            [null, 1, 5, 1, null, ":str", ">"],
          ],
        ]);
        expect(i.offset).toEqual(6);
      });
    });
  });
});
