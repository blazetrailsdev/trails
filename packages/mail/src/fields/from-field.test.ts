import { describe, expect, it } from "vitest";
import { FromField } from "./from-field.js";

describe("Mail::FromField", () => {
  describe("initialization", () => {
    it("should initialize", () => {
      expect(() => new FromField("Mikel")).not.toThrow();
    });
    it("should accept a string without the field name", () => {
      const t = new FromField('Mikel Lindsaar <mikel@test.lindsaar.net>, "Bob Smith" <bob@me.com>');
      expect(t.name).toEqual("From");
      expect(t.value).toEqual('Mikel Lindsaar <mikel@test.lindsaar.net>, "Bob Smith" <bob@me.com>');
    });
  });
  describe("instance methods", () => {
    it("should return an address", () => {
      const t = new FromField("Mikel Lindsaar <mikel@test.lindsaar.net>");
      expect([...t.formatted()]).toEqual(["Mikel Lindsaar <mikel@test.lindsaar.net>"]);
    });
    it("should return two addresses", () => {
      const t = new FromField(
        "Mikel Lindsaar <mikel@test.lindsaar.net>, Ada Lindsaar <ada@test.lindsaar.net>",
      );
      expect(t.formatted()[0]).toEqual("Mikel Lindsaar <mikel@test.lindsaar.net>");
      expect(t.addresses().at(-1)).toEqual("ada@test.lindsaar.net");
    });
    it("should return one address and a group", () => {
      const t = new FromField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.addresses()[0]).toEqual("sam@me.com");
      expect(t.addresses()[1]).toEqual("mikel@me.com");
      expect(t.addresses()[2]).toEqual("bob@you.com");
    });
    it("should return the formatted line on to_s", () => {
      const t = new FromField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.value).toEqual("sam@me.com, my_group: mikel@me.com, bob@you.com;");
    });
    it("should return the encoded line", () => {
      const t = new FromField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.encoded()).toEqual(
        "From: sam@me.com, \r\n my_group: mikel@me.com, \r\n bob@you.com;\r\n",
      );
    });
    it("should return the encoded line", () => {
      const t = new FromField("bob@me.com");
      expect(t.encoded()).toEqual("From: bob@me.com\r\n");
    });
    it("should return the decoded line", () => {
      const t = new FromField("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(t.decoded()).toEqual("sam@me.com, my_group: mikel@me.com, bob@you.com;");
    });
  });
  it("should handle non ascii", () => {
    const t = new FromField('"Foo áëô îü" <extended@example.net>');
    expect(t.decoded()).toEqual('"Foo áëô îü" <extended@example.net>');
    expect(t.encoded()).toEqual(
      "From: =?UTF-8?B?Rm9vIMOhw6vDtCDDrsO8?= <extended@example.net>\r\n",
    );
  });
  it("should work without quotes", () => {
    const t = new FromField("Foo áëô îü <extended@example.net>");
    expect(t.decoded()).toEqual('"Foo áëô îü" <extended@example.net>');
    expect(t.encoded()).toEqual(
      "From: =?UTF-8?B?Rm9vIMOhw6vDtCDDrsO8?= <extended@example.net>\r\n",
    );
  });
  it("should work with combinations of quotes and non ascii", () => {
    const t = new FromField(
      '" „Floć Žama“ Rain Shelter \\"Floć Žama-Rain Shelter\\"" <no-reply@example.com>',
    );
    expect(t.decoded()).toEqual(
      '"„Floć Žama“ Rain Shelter \\"Floć Žama-Rain Shelter\\"" <no-reply@example.com>',
    );
    expect(t.encoded()).toEqual(
      "From: =?UTF-8?B?4oCeRmxvxIcgxb1hbWHigJwgUmFpbiBTaGVsdGVyICJGbG/EhyDFvWFtYS1S?= =?UTF-8?B?YWluIFNoZWx0ZXIi?= <no-reply@example.com>\r\n",
    );
  });
});
