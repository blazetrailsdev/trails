import "./test-helpers/spec-helper.js";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".seq", () => {
    it("returns a tree with result == 0 in case of failure", () => {
      const i = new Input("tato");

      const t = Raabro.seq(null, i, ":to", ":ta");

      expect(t.toA()).toEqual([null, 0, 0, 0, null, ":seq", [[null, 0, 0, 0, null, ":str", []]]]);
      expect(i.offset).toEqual(0);
    });

    it("returns a tree with result == 0 in case of failure (at 2nd step)", () => {
      const i = new Input("tato");

      const t = Raabro.seq(null, i, ":ta", ":ta");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        0,
        0,
        0,
        null,
        ":seq",
        [
          [null, 1, 0, 2, null, ":str", "ta"],
          [null, 0, 2, 0, null, ":str", []],
        ],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("returns a tree with result == 1 in case of success", () => {
      const i = new Input("tato");

      const t = Raabro.seq(null, i, ":ta", ":to");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        4,
        null,
        ":seq",
        [
          [null, 1, 0, 2, null, ":str", "ta"],
          [null, 1, 2, 2, null, ":str", "to"],
        ],
      ]);
      expect(i.offset).toEqual(4);
    });

    it("names the result if there is a name", () => {
      const i = new Input("tato");

      const t = Raabro.seq(":x", i, ":ta", ":to");

      expect(t.toA({ leaves: true })).toEqual([
        ":x",
        1,
        0,
        4,
        null,
        ":seq",
        [
          [null, 1, 0, 2, null, ":str", "ta"],
          [null, 1, 2, 2, null, ":str", "to"],
        ],
      ]);
      expect(i.offset).toEqual(4);
    });

    it("names in case of failure as well", () => {
      const i = new Input("tato");

      const t = Raabro.seq(":y", i, ":ta", ":ta");

      expect(t.toA({ leaves: true })).toEqual([
        ":y",
        0,
        0,
        0,
        null,
        ":seq",
        [
          [null, 1, 0, 2, null, ":str", "ta"],
          [null, 0, 2, 0, null, ":str", []],
        ],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("fails when the input string ends", () => {
      const i = new Input("to");

      const t = Raabro.seq(":z", i, ":to", ":ta");

      expect(t.toA({ leaves: true })).toEqual([
        ":z",
        0,
        0,
        0,
        null,
        ":seq",
        [
          [null, 1, 0, 2, null, ":str", "to"],
          [null, 0, 2, 0, null, ":str", []],
        ],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("accepts an empty input", () => {
      const i = new Input("tato", 4);

      const t = Raabro.seq(null, i, ":to", ":ta");

      expect(t.toA()).toEqual([null, 0, 4, 0, null, ":seq", [[null, 0, 4, 0, null, ":str", []]]]);
      expect(i.offset).toEqual(4);
    });
  });

  describe("seq and quantifiers", () => {
    describe("a lonely quantifier", () => {
      it("raises an ArgumentError", () => {
        const i = new Input("tato");

        expect(() => Raabro.seq(null, i, "?")).toThrow(new ArgumentError("lone quantifier ?"));
      });
    });

    describe("the question mark quantifier", () => {
      it("lets optional elements appear in sequences (miss)", () => {
        const i = new Input("tato");

        const t = Raabro.seq(null, i, ":ta", ":tu", "?", ":to");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          4,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 0, 2, 0, null, ":str", []],
            [null, 1, 2, 2, null, ":str", "to"],
          ],
        ]);
        expect(i.offset).toEqual(4);
      });

      it("lets optional elements appear in sequences (hit)", () => {
        const i = new Input("tatuto");

        const t = Raabro.seq(null, i, ":ta", ":tu", "?", ":to");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          6,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 1, 2, 2, null, ":str", "tu"],
            [null, 1, 4, 2, null, ":str", "to"],
          ],
        ]);
        expect(i.offset).toEqual(6);
      });

      it("lets optional elements appear in sequences (fail)", () => {
        const i = new Input("tatututo");

        const t = Raabro.seq(null, i, ":ta", ":tu", "?", ":to");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          0,
          0,
          0,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 1, 2, 2, null, ":str", "tu"],
            [null, 0, 4, 0, null, ":str", []],
          ],
        ]);
        expect(i.offset).toEqual(0);
      });
    });

    describe("the star quantifier", () => {
      it("lets optional elements recur in sequences (hit zero)", () => {
        const i = new Input("tato");

        const t = Raabro.seq(null, i, ":ta", ":tu", "*", ":to");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          4,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 0, 2, 0, null, ":str", []],
            [null, 1, 2, 2, null, ":str", "to"],
          ],
        ]);
        expect(i.offset).toEqual(4);
      });

      it("lets optional elements recur in sequences (hit)", () => {
        const i = new Input("tatututo");

        const t = Raabro.seq(null, i, ":ta", ":tu", "*", ":to");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          8,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 1, 2, 2, null, ":str", "tu"],
            [null, 1, 4, 2, null, ":str", "tu"],
            [null, 0, 6, 0, null, ":str", []],
            [null, 1, 6, 2, null, ":str", "to"],
          ],
        ]);
        expect(i.offset).toEqual(8);
      });

      it("stops when there is no progress", () => {
        const i = new Input("abc");

        const t = Raabro.seq(null, i, ":toStar", "*");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          0,
          null,
          ":seq",
          [[null, 1, 0, 0, null, ":rep", [[null, 0, 0, 0, null, ":str", []]]]],
        ]);
      });
    });

    describe("the plus quantifier", () => {
      it("lets elements recur in sequences (hit)", () => {
        const i = new Input("tatututo");

        const t = Raabro.seq(null, i, ":ta", ":tu", "+", ":to");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          8,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 1, 2, 2, null, ":str", "tu"],
            [null, 1, 4, 2, null, ":str", "tu"],
            [null, 0, 6, 0, null, ":str", []],
            [null, 1, 6, 2, null, ":str", "to"],
          ],
        ]);
        expect(i.offset).toEqual(8);
      });

      it("lets elements recur in sequences (fail)", () => {
        const i = new Input("tato");

        const t = Raabro.seq(null, i, ":ta", ":tu", "+", ":to");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          0,
          0,
          0,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 0, 2, 0, null, ":str", []],
          ],
        ]);
        expect(i.offset).toEqual(0);
      });

      it("stops when there is no progress", () => {
        const i = new Input("abc");

        const t = Raabro.seq(null, i, ":toStar", "+");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          0,
          null,
          ":seq",
          [[null, 1, 0, 0, null, ":rep", [[null, 0, 0, 0, null, ":str", []]]]],
        ]);
      });
    });

    describe("the exclamation mark", () => {
      it("throws an error when lonely", () => {
        const i = new Input("tato");

        expect(() => Raabro.seq(null, i, "!")).toThrow(new ArgumentError("lone quantifier !"));
      });

      it("hits post", () => {
        const i = new Input("tatu");

        const t = Raabro.seq(null, i, ":ta", ":ta", "!");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          2,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 1, 2, 0, null, ":nott", [[null, 0, 2, 0, null, ":str", []]]],
          ],
        ]);
        expect(i.offset).toEqual(2);
      });

      it("misses post", () => {
        const i = new Input("tata");

        const t = Raabro.seq(null, i, ":ta", ":ta", "!");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          0,
          0,
          0,
          null,
          ":seq",
          [
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 0, 2, 0, null, ":nott", [[null, 1, 2, 2, null, ":str", "ta"]]],
          ],
        ]);
        expect(i.offset).toEqual(0);
      });

      it("hits pre", () => {
        const i = new Input("tatu");

        const t = Raabro.seq(null, i, ":tu", "!", ":ta", ":tu");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          4,
          null,
          ":seq",
          [
            [null, 1, 0, 0, null, ":nott", [[null, 0, 0, 0, null, ":str", []]]],
            [null, 1, 0, 2, null, ":str", "ta"],
            [null, 1, 2, 2, null, ":str", "tu"],
          ],
        ]);
        expect(i.offset).toEqual(4);
      });

      it("misses pre", () => {
        const i = new Input("tutu");

        const t = Raabro.seq(null, i, ":tu", "!", ":ta", ":tu");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          0,
          0,
          0,
          null,
          ":seq",
          [[null, 0, 0, 0, null, ":nott", [[null, 1, 0, 2, null, ":str", "tu"]]]],
        ]);
        expect(i.offset).toEqual(0);
      });
    });
  });
});
