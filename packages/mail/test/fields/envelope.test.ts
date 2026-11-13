import { DateTime } from "@blazetrails/date";
import { describe, expect, it } from "vitest";
import { Envelope } from "../../lib/envelope.js";

describe("Mail::Envelope", () => {
  it("should initialize", () => {
    expect(() => new Envelope("mikel@test.lindsaar.net Mon May  2 16:07:05 2005")).not.toThrow();
  });

  describe("accessor methods", () => {
    it("should return the address", () => {
      const envelope = new Envelope("mikel@test.lindsaar.net Mon Aug 17 00:39:21 2009");
      expect(envelope.from()).toEqual("mikel@test.lindsaar.net");
    });

    it("should return the date_time", () => {
      const envelope = new Envelope("mikel@test.lindsaar.net Mon Aug 17 00:39:21 2009");
      expect(String(envelope.date())).toEqual(String(DateTime.parse("Mon Aug 17 00:39:21 2009")));
    });
  });
});
