import "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".alt", () => {
    it("returns a tree with result == 0 in case of failure", () => {
      const i = new Input("tutu");

      const t = Raabro.alt(null, i, ":ta", ":to");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        0,
        0,
        0,
        null,
        ":alt",
        [
          [null, 0, 0, 0, null, ":str", []],
          [null, 0, 0, 0, null, ":str", []],
        ],
      ]);
      expect(i.offset).toEqual(0);
    });

    it("succeeds (1st alternative)", () => {
      const i = new Input("tato");

      const t = Raabro.alt(null, i, ":ta", ":to");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        2,
        null,
        ":alt",
        [[null, 1, 0, 2, null, ":str", "ta"]],
      ]);
      expect(i.offset).toEqual(2);
    });

    it("succeeds (2nd alternative)", () => {
      const i = new Input("tato");

      const t = Raabro.alt(null, i, ":to", ":ta");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        2,
        null,
        ":alt",
        [
          [null, 0, 0, 0, null, ":str", []],
          [null, 1, 0, 2, null, ":str", "ta"],
        ],
      ]);
      expect(i.offset).toEqual(2);
    });

    it("prunes", () => {
      const i = new Input("tato", { prune: true });

      const t = Raabro.alt(null, i, ":to", ":ta");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        2,
        null,
        ":alt",
        [[null, 1, 0, 2, null, ":str", "ta"]],
      ]);
      expect(i.offset).toEqual(2);
    });

    describe("when not greedy (default)", () => {
      it("goes with the first successful result", () => {
        const i = new Input("xx");

        const t = Raabro.alt(null, i, ":onex", ":twox");

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          1,
          null,
          ":alt",
          [[":onex", 1, 0, 1, null, ":str", "x"]],
        ]);
        expect(i.offset).toEqual(1);
      });
    });

    describe("when greedy (last argument set to true)", () => {
      it("takes the longest successful result", () => {
        const i = new Input("xx");

        const t = Raabro.alt(null, i, ":onex", ":twox", true);

        expect(t.toA({ leaves: true })).toEqual([
          null,
          1,
          0,
          2,
          null,
          ":altg",
          [
            [":onex", 0, 0, 1, null, ":str", []],
            [":twox", 1, 0, 2, null, ":str", "xx"],
          ],
        ]);
        expect(i.offset).toEqual(2);
      });
    });
  });

  describe(".altg", () => {
    it("is greedy, always", () => {
      const i = new Input("xx");

      const t = Raabro.altg(null, i, ":onex", ":twox");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        2,
        null,
        ":altg",
        [
          [":onex", 0, 0, 1, null, ":str", []],
          [":twox", 1, 0, 2, null, ":str", "xx"],
        ],
      ]);
      expect(i.offset).toEqual(2);
    });

    it("prunes", () => {
      const i = new Input("xx", { prune: true });

      const t = Raabro.altg(null, i, ":onex", ":twox");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        2,
        null,
        ":altg",
        [[":twox", 1, 0, 2, null, ":str", "xx"]],
      ]);
      expect(i.offset).toEqual(2);
    });

    it("declares a single winner", () => {
      const i = new Input("xx", { prune: true });

      const t = Raabro.altg(null, i, ":twox", ":onex");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        2,
        null,
        ":altg",
        [[":twox", 1, 0, 2, null, ":str", "xx"]],
      ]);
      expect(i.offset).toEqual(2);
    });

    it("takes the longest and latest winner", () => {
      const i = new Input("xx", { prune: true });

      const t = Raabro.altg(null, i, ":twox", ":onex", ":deux");

      expect(t.toA({ leaves: true })).toEqual([
        null,
        1,
        0,
        2,
        null,
        ":altg",
        [[":deux", 1, 0, 2, null, ":str", "xx"]],
      ]);
      expect(i.offset).toEqual(2);
    });
  });
});
