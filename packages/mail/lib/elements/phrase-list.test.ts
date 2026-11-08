import { describe, expect, it } from "vitest";
import { PhraseList } from "./phrase-list.js";

describe("Mail::PhraseList", () => {
  describe("parsing", () => {
    it("should parse a phrase list", () => {
      const parseText = '"Mikel Lindsaar", "Mikel", you, somewhere';
      expect(() => new PhraseList(parseText)).not.toThrow();
    });

    it("treats nil as an empty list", () => {
      const list = new PhraseList(null);
      expect(list.phrases).toEqual([]);
    });

    it("should not raise an error if the input is useless", () => {
      const parseText = '""""""""""""""""';
      expect(new PhraseList(parseText).phrases).toEqual([parseText.slice(1, -1)]);
    });
  });
});
