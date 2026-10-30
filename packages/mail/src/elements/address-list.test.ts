import { describe, expect, it } from "vitest";
import { Field } from "../field.js";
import { Address } from "./address.js";
import { AddressList } from "./address-list.js";

describe("Mail::AddressList", () => {
  describe("parsing", () => {
    it("should parse an address list", () => {
      const parseText = "test@lindsaar.net";
      expect(() => new AddressList(parseText)).not.toThrow();
    });

    it("should raise an error if the input is useless", () => {
      const parseText = "@@@@@@";
      expect(() => new AddressList(parseText)).toThrow(Field.ParseError);
    });

    it("should not raise an error if the input is just blank", () => {
      const parseText = null;
      expect(() => new AddressList(parseText)).not.toThrow();
    });

    it("should raise an error if the input is useless", () => {
      const parseText = "This ( is an invalid address!";
      expect(() => new AddressList(parseText)).toThrow(Field.ParseError);
    });

    it("should give the address passed in", () => {
      const parseText = "test@lindsaar.net";
      const result = "test@lindsaar.net";
      const a = new AddressList(parseText);
      expect(a.addresses[0].toString()).toEqual(result);
    });

    it("should give the addresses passed in", () => {
      const parseText = "test@lindsaar.net, test2@lindsaar.net";
      const result = ["test@lindsaar.net", "test2@lindsaar.net"];
      const a = new AddressList(parseText);
      expect(a.addresses.map((addr) => addr.toString())).toEqual(result);
    });

    it("should preserve the display name", () => {
      const parseText = '"Mikel Lindsaar" <mikel@test.lindsaar.net>';
      const result = "Mikel Lindsaar <mikel@test.lindsaar.net>";
      const a = new AddressList(parseText);
      expect(a.addresses[0].format()).toEqual(result);
      expect(a.addresses[0].displayName()).toEqual("Mikel Lindsaar");
    });

    it("should handle and ignore nil addresses", () => {
      const parseText = " , user-example@aol.com, e-s-a-s-2200@app.ar.com";
      const result = ["user-example@aol.com", "e-s-a-s-2200@app.ar.com"];
      const a = new AddressList(parseText);
      expect(a.addresses.map((addr) => addr.toString())).toEqual(result);
    });

    it("should handle truly horrific combinations of commas, spaces, and addresses", () => {
      const parseText = "  ,, foo@example.com,  ,    ,,, bar@example.com  ,,";
      const result = ["foo@example.com", "bar@example.com"];
      const a = new AddressList(parseText);
      expect(a.addresses.map((addr) => addr.toString())).toEqual(result);
    });

    it("should handle folding whitespace", () => {
      const parseText = "foo@example.com,\r\n\tbar@example.com";
      const result = ["foo@example.com", "bar@example.com"];
      const a = new AddressList(parseText);
      expect(a.addresses.map((addr) => addr.toString())).toEqual(result);
    });

    it.fails("should handle malformed folding whitespace", () => {
      const parseText =
        "leads@sg.dc.com,\n\t sag@leads.gs.ry.com,\n\t sn@example-hotmail.com,\n\t e-s-a-g-8718@app.ar.com,\n\t jp@t-exmaple.com,\n\t\n\t cc@c-l-example.com";
      const result =
        "leads@sg.dc.com sag@leads.gs.ry.com sn@example-hotmail.com e-s-a-g-8718@app.ar.com jp@t-exmaple.com cc@c-l-example.com".split(
          " ",
        );
      const a = new AddressList(parseText);
      expect(a.addresses.map((addr) => addr.toString())).toEqual(result);
    });

    it("should extract comments in addreses which are part of a group", () => {
      const parseText = "group: jimmy <jimmy@(comment)example.com>;";
      const result = ["comment"];
      const a = new AddressList(parseText);
      expect(a.addresses[0].comments).toEqual(result);
    });
  });

  describe("functionality", () => {
    it("should give all the groups when asked", () => {
      const list = new AddressList("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(list.addressesGroupedByGroup().size).toEqual(1);
    });

    it("should ask the group for all its addresses", () => {
      const list = new AddressList("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect([...list.addressesGroupedByGroup().values()][0].length).toEqual(2);
    });

    it("should give all the addresses when asked", () => {
      const list = new AddressList("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(list.addresses.length).toEqual(3);
    });

    it("should handle a really nasty obsolete address list", () => {
      const psycho_obsolete = "Mary Smith <@machine.tld:mary@example.net>, , jdoe@test   . example";
      const list = new AddressList(psycho_obsolete);
      expect(list.addresses.length).toEqual(2);
    });

    it("should create an address instance for each address returned", () => {
      const list = new AddressList("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      for (const address of list.addresses) {
        expect(address.constructor).toEqual(Address);
      }
    });

    it("should provide a list of group names", () => {
      const list = new AddressList("sam@me.com, my_group: mikel@me.com, bob@you.com;");
      expect(list.groupNames).toEqual(["my_group"]);
    });
  });
});
