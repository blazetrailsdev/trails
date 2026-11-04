import { describe, expect, it } from "vitest";
import { MimeVersionField } from "./mime-version-field.js";

describe("Mail::MimeVersionField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new MimeVersionField("1.0")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new MimeVersionField("1.0");
      expect(t.name).toEqual("Mime-Version");
      expect(t.value).toEqual("1.0");
    });
  });
  describe("parsing a version string", () => {
    it("should get a major value", () => {
      const t = new MimeVersionField("1.0");
      expect(t.major()).toEqual(1);
    });
    it("should get a minor value", () => {
      const t = new MimeVersionField("1.0");
      expect(t.minor()).toEqual(0);
    });
    it("should get a version string", () => {
      const t = new MimeVersionField("1.0");
      expect(t.version()).toEqual("1.0");
    });
    it("should handle comments before the major version", () => {
      const t = new MimeVersionField("(This is a comment) 1.0");
      expect(t.version()).toEqual("1.0");
    });
    it("should handle comments before the major version without space", () => {
      const t = new MimeVersionField("(This is a comment)1.0");
      expect(t.version()).toEqual("1.0");
    });
    it("should handle comments after the major version without space", () => {
      const t = new MimeVersionField("1(This is a comment).0");
      expect(t.version()).toEqual("1.0");
    });
    it("should handle comments before the minor version without space", () => {
      const t = new MimeVersionField("1.(This is a comment)0");
      expect(t.version()).toEqual("1.0");
    });
    it("should handle comments after the minor version without space", () => {
      const t = new MimeVersionField("1.0(This is a comment)");
      expect(t.version()).toEqual("1.0");
    });
    it("should handle comments after the minor version", () => {
      const t = new MimeVersionField("1.0 (This is a comment)");
      expect(t.version()).toEqual("1.0");
    });
    it("should accept nil as a value", () => {
      const t = new MimeVersionField(null);
      expect(t.version()).not.toBeNull();
    });
    it("should provide an encoded value", () => {
      const t = new MimeVersionField("1.0 (This is a comment)");
      expect(t.encoded()).toEqual("Mime-Version: 1.0\r\n");
    });
    it("should provide an decoded value", () => {
      const t = new MimeVersionField("1.0 (This is a comment)");
      expect(t.decoded()).toEqual("1.0");
    });
  });
});
