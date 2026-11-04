import { describe, expect, it } from "vitest";
import { KeywordsField } from "./keywords-field.js";

describe("Mail::KeywordsField", () => {
  describe("initializing", () => {
    it("should initialize", () => {
      expect(() => new KeywordsField("this, is, email")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const k = new KeywordsField("these are keywords, so there");
      expect(k.name).toEqual("Keywords");
      expect(k.value).toEqual("these are keywords, so there");
    });
  });
  describe("giving a list of keywords", () => {
    it("should return a list of keywords", () => {
      const k = new KeywordsField("these are keywords, so there");
      expect(k.keywords()).toEqual(["these are keywords", "so there"]);
    });
    it("should handle phrases", () => {
      const k = new KeywordsField('"these, are keywords", so there');
      expect(k.keywords()).toEqual(["these, are keywords", "so there"]);
    });
    it("should handle comments", () => {
      const k = new KeywordsField(
        '"these, are keywords", so there (This is an irrelevant comment)',
      );
      expect(k.keywords()).toEqual([
        "these, are keywords",
        "so there (This is an irrelevant comment)",
      ]);
    });
    it("should handle comments", () => {
      const k = new KeywordsField(
        '"these, are keywords", so there (This is an irrelevant comment)',
      );
      expect(k.keywords()).toEqual([
        "these, are keywords",
        "so there (This is an irrelevant comment)",
      ]);
    });
    it("should handle comments in quotes", () => {
      const k = new KeywordsField(
        '"these, are keywords (another comment to be ignored)", so there (This is an irrelevant comment)',
      );
      expect(k.keywords()).toEqual([
        "these, are keywords (another comment to be ignored)",
        "so there (This is an irrelevant comment)",
      ]);
    });
  });
  describe("encoding and decoding", () => {
    it("should encode", () => {
      const k = new KeywordsField("these are keywords, so there");
      expect(k.encoded()).toEqual("Keywords: these are keywords,\r\n so there\r\n");
    });
    it("should decode", () => {
      const k = new KeywordsField("these are keywords, so there");
      expect(k.decoded()).toEqual("these are keywords, so there");
    });
  });
  it("should output lines shorter than 998 chars", () => {
    const k = new KeywordsField(
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed placerat euismod velit nec convallis. Cras bibendum mattis arcu a tincidunt. Nullam ac orci vitae massa elementum ultricies ultricies nec quam. Praesent eleifend viverra semper. Sed id ultricies ipsum. Pellentesque sed nunc mauris, at varius sem. Curabitur pretium pellentesque velit, eget pellentesque dolor interdum eget. Duis ac lectus nec arcu pharetra lobortis. Integer risus felis, convallis ut feugiat quis, imperdiet ut sapien. Nullam imperdiet leo nec lectus imperdiet mollis. Proin nec lectus id erat pellentesque pretium vitae sit amet massa. Proin interdum pellentesque mi, at tristique sem facilisis ut. Donec enim mauris, viverra ut lacinia pharetra, elementum nec mi. Ut at interdum massa. Integer placerat tortor at tellus lobortis a mattis massa ultricies. Vivamus nec dolor at justo fringilla laoreet rhoncus fermentum lectus. Praesent tincidunt congue mauris vitae aliquam. Mauris arcu mauris, faucibus sed turpis duis.",
    );
    const lines = k.encoded().split("\r\n ");
    lines.forEach((line) => expect(line.length).toBeLessThan(998));
  });
});
