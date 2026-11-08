import "./test-helpers/spec-helper.js";
import { Raabro, Input } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro", () => {
  describe(".str", () => {
    it("returns a tree with result == 0 in case of failure", () => {
      const i = new Input("toto");

      const t = Raabro.str(null, i, "nada");

      expect(t.toA()).toEqual([null, 0, 0, 0, null, ":str", []]);
      expect(i.offset).toEqual(0);
    });

    it("returns a tree with result == 1 in case of success", () => {
      const i = new Input("toto");

      const t = Raabro.str(null, i, "toto");

      expect(t.toA()).toEqual([null, 1, 0, 4, null, ":str", []]);
      expect(i.offset).toEqual(4);
    });

    it("names the result if there is a name", () => {
      const i = new Input("toto");

      const t = Raabro.str(":x", i, "toto");

      expect(t.toA()).toEqual([":x", 1, 0, 4, null, ":str", []]);
      expect(i.offset).toEqual(4);
    });

    it("names in case of failure as well", () => {
      const i = new Input("toto");

      const t = Raabro.str(":y", i, "nada");

      expect(t.toA()).toEqual([":y", 0, 0, 0, null, ":str", []]);
      expect(i.offset).toEqual(0);
    });

    it("accepts an empty input", () => {
      const i = new Input("toto");
      i.offset = 4;

      const t = Raabro.str(null, i, "nada");

      expect(t.toA()).toEqual([null, 0, 4, 0, null, ":str", []]);
      expect(i.offset).toEqual(4);
    });
  });
});
