import { describe, expect, it } from "vitest";
import { BccField } from "./bcc-field.js";

describe("Mail::BccField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new BccField("Mikel")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new BccField('Mikel Lindsaar <mikel@test.lindsaar.net>, "Bob Smith" <bob@me.com>');
      expect(t.name).toEqual("Bcc");
      expect(t.value).toEqual('Mikel Lindsaar <mikel@test.lindsaar.net>, "Bob Smith" <bob@me.com>');
    });
  });
  describe("instance methods", () => {
    it("should return an address", () => {
      const t = new BccField("Mikel Lindsaar <mikel@test.lindsaar.net>");
      expect([...t.formatted()]).toEqual(["Mikel Lindsaar <mikel@test.lindsaar.net>"]);
    });
    it("should return two addresses", () => {
      const t = new BccField(
        "Mikel Lindsaar <mikel@test.lindsaar.net>, Ada Lindsaar <ada@test.lindsaar.net>",
      );
      expect(t.formatted()[0]).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
      expect(t.addresses().at(-1)).toEqual("ada@test.lindsaar.net");
    });
    it("should return one address and a group", () => {
      const t = new BccField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.addresses()[0]).toEqual("sam@me.com");
      expect(t.addresses()[1]).toEqual("mikel@me.com");
      expect(t.addresses()[2]).toEqual("bob@you.com");
    });
    it("should return the formatted line on to_s", () => {
      const t = new BccField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.value).toEqual("sam@me.com, my_group: mikel@me.com, bob@you.com;");
    });
    it("should return nothing by default on encoded as Bcc should not be in the mail", () => {
      const t = new BccField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.encoded()).toEqual("");
    });
    it("should return the encoded line for one address when requested to include in headers", () => {
      const t = new BccField("sam@me.com");
      t.includeInHeaders = true;
      expect(t.encoded()).toEqual("Bcc: sam@me.com\r\n");
    });
    it("should return the encoded line when requested to include in headers", () => {
      const t = new BccField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      t.includeInHeaders = true;
      expect(t.encoded()).toEqual(
        "Bcc: sam@me.com, \r\n my_group: mikel@me.com, \r\n bob@you.com;\r\n",
      );
    });
    it("should return the decoded line", () => {
      const t = new BccField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.decoded()).toEqual("sam@me.com, my_group: mikel@me.com, bob@you.com;");
    });
  });
});
