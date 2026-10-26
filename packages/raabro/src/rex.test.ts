import "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".rex", () => {
    it("hits", () => {
      const i = new Input("toto");

      const t = Raabro.rex(null, i, /t[ua]/);

      expect(t.toA()).toEqual([null, 0, 0, 0, null, ":rex", []]);
      expect(i.offset).toEqual(0);
    });

    it("misses", () => {
      const i = new Input("toto");

      const t = Raabro.rex(null, i, /(to)+/);

      expect(t.toA({ leaves: true })).toEqual([null, 1, 0, 4, null, ":rex", "toto"]);
      expect(i.offset).toEqual(4);
    });

    it("misses if the match is not at the current input offset", () => {
      const i = new Input("tato");

      const t = Raabro.rex(":biga", i, /(to)+/);

      expect(t.toA({ leaves: true })).toEqual([":biga", 0, 0, 0, null, ":rex", []]);
      expect(i.offset).toEqual(0);
    });
  });
});
