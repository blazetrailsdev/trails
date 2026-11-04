import { describe, expect, it } from "vitest";
import { ContentLocationField } from "./content-location-field.js";

describe("Mail::ContentLocationField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new ContentLocationField("Content-Location", "7bit")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new ContentLocationField("photo.jpg");
      expect(t.name).toEqual("Content-Location");
      expect(t.value).toEqual("photo.jpg");
    });
    it("should render an encoded field", () => {
      const t = new ContentLocationField("photo.jpg");
      expect(t.encoded()).toEqual("Content-Location: photo.jpg\r\n");
    });
    it("should render a decoded field", () => {
      const t = new ContentLocationField("photo.jpg");
      expect(t.decoded()).toEqual("photo.jpg");
    });
  });
  describe("parsing the value", () => {
    it("should return an encoding string unquoted", () => {
      const t = new ContentLocationField('"A quoted filename.jpg"');
      expect(t.location()).toEqual("A quoted filename.jpg");
    });
  });
});
