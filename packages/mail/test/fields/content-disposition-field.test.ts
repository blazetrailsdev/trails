import type {} from "@blazetrails/vitest-matchers";
import { describe, expect, it } from "vitest";
import { ContentDispositionField } from "../../lib/fields/content-disposition-field.js";
import { ParameterHash } from "../../lib/fields/parameter-hash.js";

describe("Mail::ContentDispositionField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new ContentDispositionField("attachment; filename=File")).not.toThrow();
    });

    it("should accept a string without the field name", () => {
      const c = new ContentDispositionField("attachment; filename=File");
      expect(c.name).toEqual("Content-Disposition");
      expect(c.value).toEqual("attachment; filename=File");
    });

    it("should accept a nil value and generate a disposition type", () => {
      const c = new ContentDispositionField(null);
      expect(c.name).toEqual("Content-Disposition");
      expect(c.value).not.toBeNull();
    });

    it("should render encoded", () => {
      const c = new ContentDispositionField("attachment; filename=File");
      expect(c.encoded()).toEqual("Content-Disposition: attachment;\r\n filename=File\r\n");
    });

    it("should render encoded for inline", () => {
      const c = new ContentDispositionField("inline");
      expect(c.encoded()).toEqual("Content-Disposition: inline\r\n");
    });

    it("should wrap a filename in double quotation marks only if the filename contains spaces and does not already have double quotation marks", () => {
      let c = new ContentDispositionField("attachment; filename=This is a bad filename.txt");
      expect(c.value).toEqual('attachment; filename="This is a bad filename.txt"');

      c = new ContentDispositionField("attachment; filename=some.jpg");
      expect(c.value).toEqual("attachment; filename=some.jpg");

      c = new ContentDispositionField(
        'attachment; filename="Bad filename but at least it is wrapped in quotes.txt"',
      );
      expect(c.value).toEqual(
        'attachment; filename="Bad filename but at least it is wrapped in quotes.txt"',
      );
    });

    it("should render decoded", () => {
      const c = new ContentDispositionField("attachment; filename=File");
      expect(c.decoded()).toEqual("attachment; filename=File");
    });

    it("should render decoded inline", () => {
      const c = new ContentDispositionField("inline");
      expect(c.decoded()).toEqual("inline");
    });

    it("should handle upper and mixed case INLINE and AttachMent", () => {
      let c = new ContentDispositionField("INLINE");
      expect(c.decoded()).toEqual("inline");
      c = new ContentDispositionField("AttachMent");
      expect(c.decoded()).toEqual("attachment");
    });
  });

  describe("instance methods", () => {
    it("should give its disposition type", () => {
      const c = new ContentDispositionField("attachment; filename=File");
      expect(c.dispositionType()).toEqual("attachment");
      expect(Object.fromEntries(c.parameters().entries())).toEqual({ filename: "File" });
    });

    it("should accept a blank disposition type", () => {
      const c = new ContentDispositionField("");
      expect(c.dispositionType()).not.toBeNull();
    });

    it("handles nil value", () => {
      const c = new ContentDispositionField(null, "utf-8");
      expect(c.parameters()).toBeInstanceOf(ParameterHash);
      expect(c.parameters()).toBeEmpty();
    });
  });

  describe("finding a filename", () => {
    it("should locate a filename if there is a filename", () => {
      const string = "attachment; filename=mikel.jpg";
      const c = new ContentDispositionField(string);
      expect(c.filename()).toEqual("mikel.jpg");
    });

    it("should locate a name if there is no filename", () => {
      const string = "attachment; name=mikel.jpg";
      const c = new ContentDispositionField(string);
      expect(c.filename()).toEqual("mikel.jpg");
    });

    it("should return an empty string when filename or name is empty", () => {
      let string = 'attachment; filename=""';
      let c = new ContentDispositionField(string);
      expect(c.filename()).toEqual("");

      string = 'attachment; name=""';
      c = new ContentDispositionField(string);
      expect(c.filename()).toEqual("");
    });

    it("should locate an encoded name as a filename", () => {
      const string = "attachment; name*=ISO-8859-1''Eelanal%FC%FCsi%20p%E4ring.jpg";
      const c = new ContentDispositionField(string);
      expect(c.filename()).toEqual("Eelanalüüsi päring.jpg");
    });
  });
});
