/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import { FromField } from "./from-field.js";
import { StructuredField } from "./structured-field.js";

let field: any;

describe("Mail::StructuredField", () => {
  describe("initialization", () => {
    it("should be instantiated", () => {
      expect(() => new StructuredField("From", "bob@me.com")).not.toThrow();
    });
  });
  describe("manipulation", () => {
    beforeEach(() => {
      field = new StructuredField("From", "bob@me.com");
    });
    it("should allow us to set a text value at initialization", () => {
      expect(() => new StructuredField("From", "bob@me.com")).not.toThrow();
    });
    it("should provide access to the text of the field once set", () => {
      expect(field.value).toEqual("bob@me.com");
    });
    it("should provide a means to change the value", () => {
      field.value = "bob@you.com";
      expect(field.value).toEqual("bob@you.com");
    });
  });
  describe("displaying encoded field and decoded value", () => {
    beforeEach(() => {
      field = new FromField("bob@me.com");
    });
    it("should provide a to_s function that returns the decoded string", () => {
      expect(field.toString()).toEqual("bob@me.com");
    });
    it("should return '' on to_s if there is no value", () => {
      field.value = null;
      expect(field.encoded()).toEqual("");
    });
    it("should give an encoded value ready to insert into an email", () => {
      expect(field.encoded()).toEqual("From: bob@me.com\r\n");
    });
    it("should return an empty string on encoded if it has no value", () => {
      field.value = null;
      expect(field.encoded()).toEqual("");
    });
    it("should return the field name and value in proper format when called to_s", () => {
      expect(field.encoded()).toEqual("From: bob@me.com\r\n");
    });
  });
});
