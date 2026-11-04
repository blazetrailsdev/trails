import type {} from "@blazetrails/vitest-matchers";
import { describe, expect, it } from "vitest";
import { Utilities } from "../utilities.js";
import { ContentIdField } from "./content-id-field.js";

describe("Mail::ContentIdField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new ContentIdField("<1234@test.lindsaar.net>")).not.toThrow();
    });

    it("should accept a string without the field name", () => {
      const m = new ContentIdField("<1234@test.lindsaar.net>");
      expect(m.name).toEqual("Content-ID");
      expect(m.value).toEqual("<1234@test.lindsaar.net>");
      expect(m.contentId()).toEqual("1234@test.lindsaar.net");
    });

    it("should accept a nil value and generate a content_id", () => {
      const m = new ContentIdField(null);
      expect(m.name).toEqual("Content-ID");
      expect(m.value).not.toBeNull();
    });

    it("should allow it to be encoded", () => {
      const m = new ContentIdField("<1234@test.lindsaar.net>");
      expect(m.encoded()).toEqual("Content-ID: <1234@test.lindsaar.net>\r\n");
    });

    it("should allow it to be decoded", () => {
      const m = new ContentIdField("<1234@test.lindsaar.net>");
      expect(m.decoded()).toEqual("<1234@test.lindsaar.net>");
    });
  });

  describe("ensuring only one message ID", () => {
    it("should not accept a string with multiple message IDs but only return the first", () => {
      const m = new ContentIdField("<1234@test.lindsaar.net> <4567@test.lindsaar.net>");
      expect(m.name).toEqual("Content-ID");
      expect(m.toString()).toEqual("<1234@test.lindsaar.net>");
      expect(m.contentId()).toEqual("1234@test.lindsaar.net");
    });

    it("should change the message id if given a new message id", () => {
      const m = new ContentIdField("<1234@test.lindsaar.net>");
      expect(m.toString()).toEqual("<1234@test.lindsaar.net>");
      m.value = "<4567@test.lindsaar.net>";
      expect(m.toString()).toEqual("<4567@test.lindsaar.net>");
    });
  });

  describe("instance methods", () => {
    it("should provide to_s", () => {
      const m = new ContentIdField("<1234@test.lindsaar.net>");
      expect(m.toString()).toEqual("<1234@test.lindsaar.net>");
      expect(String(m.contentId())).toEqual("1234@test.lindsaar.net");
    });

    it("should provide encoded", () => {
      const m = new ContentIdField("<1234@test.lindsaar.net>");
      expect(m.encoded()).toEqual("Content-ID: <1234@test.lindsaar.net>\r\n");
    });

    it("should respond to :responsible_for?", () => {
      const m = new ContentIdField("<1234@test.lindsaar.net>");
      expect(m).toRespondTo("isResponsibleFor");
    });
  });

  describe("generating a message id", () => {
    it("should generate a message ID if it has no value", () => {
      const m = new ContentIdField();
      expect(Utilities.isBlank(m.contentId())).not.toBeTruthy();
    });

    it("should generate a random message ID", () => {
      const m = new ContentIdField();
      for (let i = 1; i <= 100; i++) {
        expect(m.contentId()).not.toEqual(new ContentIdField().contentId());
      }
    });
  });
});
