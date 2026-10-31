import { describe, expect, it } from "vitest";
import { ToField } from "./to-field.js";

describe("Mail::ToField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new ToField("Mikel")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new ToField('Mikel Lindsaar <mikel@test.lindsaar.net>, "Bob Smith" <bob@me.com>');
      expect(t.name).toEqual("To");
      expect(t.value).toEqual('Mikel Lindsaar <mikel@test.lindsaar.net>, "Bob Smith" <bob@me.com>');
    });
  });
  describe("instance methods", () => {
    it("should return an address", () => {
      const t = new ToField("Mikel Lindsaar <mikel@test.lindsaar.net>");
      expect([...t.formatted()]).toEqual(["Mikel Lindsaar <mikel@test.lindsaar.net>"]);
    });
    it("should return two addresses", () => {
      const t = new ToField(
        "Mikel Lindsaar <mikel@test.lindsaar.net>, Ada Lindsaar <ada@test.lindsaar.net>",
      );
      expect(t.formatted()[0]).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
      expect(t.addresses().at(-1)).toEqual("ada@test.lindsaar.net");
    });
    it("should return one address and a group", () => {
      const t = new ToField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.addresses()[0]).toEqual("sam@me.com");
      expect(t.addresses()[1]).toEqual("mikel@me.com");
      expect(t.addresses()[2]).toEqual("bob@you.com");
    });
    it("should return the formatted line on to_s", () => {
      const t = new ToField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.value).toEqual("sam@me.com, my_group: mikel@me.com, bob@you.com;");
    });
    it("should return the encoded line", () => {
      const t = new ToField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.encoded()).toEqual(
        "To: sam@me.com, \r\n my_group: mikel@me.com, \r\n bob@you.com;\r\n",
      );
    });
    it("should return the decoded line", () => {
      const t = new ToField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.decoded()).toEqual("sam@me.com, my_group: mikel@me.com, bob@you.com;");
    });
    it("should get multiple address out from a group list", () => {
      const t = new ToField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect([...t.addresses()]).toEqual(["sam@me.com", "mikel@me.com", "bob@you.com"]);
    });
    it("should handle commas in the address", () => {
      const t = new ToField('"Long, stupid email address" <mikel@test.lindsaar.net>');
      expect([...t.addresses()]).toEqual(["mikel@test.lindsaar.net"]);
    });
    it("should handle commas in the address for multiple fields", () => {
      const t = new ToField(
        '"Long, stupid email address" <mikel@test.lindsaar.net>, "Another, really, really, long, stupid email address" <bob@test.lindsaar.net>',
      );
      expect([...t.addresses()]).toEqual(["mikel@test.lindsaar.net", "bob@test.lindsaar.net"]);
    });
  });
  describe("unicode address", () => {
    it("should allow unicode local part jp", () => {
      const t = new ToField("Mikel Lindsár <マイケル@test.lindsaar.net>");
      expect(t.encoded()).toEqual(
        "To: =?UTF-8?B?TWlrZWwgTGluZHPDoXI=?= <=?UTF-8?B?44Oe44Kk44Kx44Or?=@test.lindsaar.net>\r\n",
      );
      expect([...t.displayNames()]).toEqual(["Mikel Lindsár"]);
      expect([...t.addresses()]).toEqual(["マイケル@test.lindsaar.net"]);
      expect(t.addrs()[0].local()).toEqual("マイケル");
    });
    it("should allow unicode local", () => {
      const t = new ToField('"Mikel Lindsár" <lindsär@test.com>');
      expect(t.encoded()).toEqual(
        "To: =?UTF-8?B?TWlrZWwgTGluZHPDoXI=?= <=?UTF-8?B?bGluZHPDpHI=?=@test.com>\r\n",
      );
      expect([...t.displayNames()]).toEqual(["Mikel Lindsár"]);
      expect(t.addrs()[0].address()).toEqual("lindsär@test.com");
    });
    it("should allow unicode local (simple)", () => {
      const t = new ToField("ölsen@ms.com");
      expect(t.encoded()).toEqual("To: =?UTF-8?B?w7Zsc2Vu?=@ms.com\r\n");
    });
    it("should allow unicode local (complex)", () => {
      const t = new ToField('<"mik@test.<æ>"@ms.com>');
      expect(t.encoded()).toEqual("To: =?UTF-8?B?Im1pa0B0ZXN0LjzDpj4i?=@ms.com\r\n");
      expect(t.addrs()[0].local()).toEqual('"mik@test.<æ>"');
    });
    it("should allow emoji local", () => {
      const t = new ToField(", 😍@me.eu");
      expect(t.encoded()).toEqual("To: =?UTF-8?B?8J+YjQ==?=@me.eu\r\n");
    });
  });
});
