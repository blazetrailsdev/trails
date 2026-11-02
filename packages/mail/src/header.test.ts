import { describe, expect, it } from "vitest";
import { ArgumentError, rbObjDup } from "@blazetrails/ruby-compat";
import { Field, Header } from "./index.js";

const one = (field: unknown) => field as Field;

describe("Mail::Header", () => {
  describe("instance methods", () => {
    it("should be Enumerable", () => {
      const header = new Header("To: James Random\r\nFrom: Santa Claus\r\n");
      expect(header.find((f: Field) => f.isResponsibleFor("From"))).toBeInstanceOf(Field);
    });
  });

  describe("creating fields", () => {
    it("should not accept field names containing colons", () => {
      expect(() => new Header().set("a:b", "c")).toThrow(ArgumentError);
    });
  });

  describe("parsing", () => {
    it("should handle an empty X-* header value", () => {
      const header = new Header("X-MS-TNEF-Correlator:\r\n");
      expect(header.fields.length).toEqual(1);
      expect(one(header.get("X-MS-TNEF-Correlator")).decoded()).toBeNull();
      expect(one(header.get("X-MS-TNEF-Correlator")).encoded()).toEqual(
        "X-MS-TNEF-Correlator: \r\n",
      );
    });
  });

  describe("error handling", () => {
    it("should collect up any of its fields' errors", () => {
      const header = new Header("Content-Transfer-Encoding: vl@d\r\nReply-To: a b b");
      const errors = header.errors() as unknown[][];
      expect(errors.length).toEqual(2);
      expect(errors[0][0]).toEqual("Reply-To");
      expect(errors[1][1]).toEqual("vl@d");
    });
  });

  describe("handling date fields with multiple values", () => {
    it("should delete all references to a field", () => {
      const header = new Header();
      header.fields = ["X-Mail-SPAM: 15", "X-Mail-SPAM: 20"];
      header.set("X-Mail-SPAM", "10000");
      expect((header.get("X-Mail-SPAM") as Field[]).map((x) => x.value)).toEqual([
        "15",
        "20",
        "10000",
      ]);
      header.set("X-Mail-SPAM", null);
      expect(header.get("X-Mail-SPAM")).toBeNull();
    });
  });

  describe("copying", () => {
    it("should instantiate with a string passed in", () => {
      const header = new Header("To: Mikel\r\nFrom: bob\r\n");
      const copy = rbObjDup(header);
      expect(one(copy.get("to")).equals(one(header.get("to")))).toBe(true);
    });
  });
});
