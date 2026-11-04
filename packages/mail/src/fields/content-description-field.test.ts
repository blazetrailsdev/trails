import { describe, expect, it } from "vitest";
import { ContentDescriptionField } from "./content-description-field.js";

describe("Mail::ContentDescriptionField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new ContentDescriptionField("This is a description")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new ContentDescriptionField("This is a description");
      expect(t.name).toEqual("Content-Description");
      expect(t.value).toEqual("This is a description");
    });
  });
});
