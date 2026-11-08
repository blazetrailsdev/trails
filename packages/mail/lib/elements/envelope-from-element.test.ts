import { describe, expect, it } from "vitest";
import { DateTime, Time } from "@blazetrails/date";
import { EnvelopeFromElement } from "./envelope-from-element.js";

describe("Mail::EnvelopeFromElement", () => {
  describe("parsing a from envelope string", () => {
    it("should parse a full field", () => {
      expect(
        () => new EnvelopeFromElement("mikel@test.lindsaar.net  Mon Aug  7 00:39:21 2009"),
      ).not.toThrow();
    });

    it("should parse a full field with a double digit day", () => {
      expect(
        () => new EnvelopeFromElement("mikel@test.lindsaar.net  Mon Aug 17 00:39:21 2009"),
      ).not.toThrow();
    });

    it("should parse a full field with a single space day", () => {
      expect(
        () => new EnvelopeFromElement("mikel@test.lindsaar.net Mon Aug 17 00:39:21 2009"),
      ).not.toThrow();
    });

    it("should parse a null sender, when specified as <>", () => {
      expect(() => new EnvelopeFromElement("<>  Mon Aug 17 00:39:21 2009")).not.toThrow();
    });

    it("should parse a null sender, with a single space day", () => {
      expect(() => new EnvelopeFromElement("<> Mon Aug 17 00:39:21 2009")).not.toThrow();
    });
  });

  describe("accessor methods", () => {
    it("should return the address", () => {
      const envelope = new EnvelopeFromElement("mikel@test.lindsaar.net Mon Aug 17 00:39:21 2009");
      expect(envelope.address).toEqual("mikel@test.lindsaar.net");
    });

    it("should return the date_time", () => {
      const envelope = new EnvelopeFromElement("mikel@test.lindsaar.net Mon Aug 17 00:39:21 2009");
      expect(envelope.dateTime).toEqual(DateTime.parse("Mon Aug 17 00:39:21 2009"));
    });
  });

  describe("formatting", () => {
    it("should format delivery date using UNIX ctime style", () => {
      const time = Time.now();
      const envelope = new EnvelopeFromElement(
        `mikel@test.lindsaar.net ${time.strftime("%a %b %e %T %Y")}`,
      );
      expect(envelope.toString()).toEqual(
        `mikel@test.lindsaar.net ${time.strftime("%a %b %e %T %Y")}`,
      );
    });
  });
});
