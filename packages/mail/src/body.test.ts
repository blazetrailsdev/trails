import { describe, expect, it } from "vitest";
import { Body } from "./body.js";
import "./index.js";

describe("Mail::Body", () => {
  describe("initialization", () => {
    it("should be instantiated", () => {
      expect(() => new Body()).not.toThrow();
    });
    it("should initialize on a nil value", () => {
      expect(() => new Body(null)).not.toThrow();
    });
    it("should accept text as raw source data", () => {
      expect(new Body("this is some text").toString()).toEqual("this is some text");
    });
    it("should accept nil as a value and return an empty body", () => {
      expect(new Body().toString()).toEqual("");
    });
    it("should accept an array as the body and join it", () => {
      expect(() => new Body(["line one\n", "line two\n"])).not.toThrow();
    });
    it("should accept an array as the body and join it", () => {
      expect(new Body(["line one\n", "line two\n"]).encoded()).toEqual("line one\r\nline two\r\n");
    });
  });

  describe("encoding", () => {
    it("should accept text as raw source data", () => {
      expect(new Body("this is some text").encoded()).toEqual("this is some text");
    });
    it("should set its own encoding to us_ascii if it is ascii only body", () => {
      expect(new Body("This is some text").charset).toEqual("US-ASCII");
    });
    it("should allow you to set its encoding", () => {
      const body = new Body("");
      body.charset = "UTF-8";
      expect(body.charset).toEqual("UTF-8");
    });
    it("should allow you to specify an encoding", () => {
      const body = new Body("");
      body.setEncoding("base64");
      expect(body.encoding()).toEqual("base64");
    });
    it("should convert all new lines to crlf", () => {
      expect(new Body("This has \n various \r new \r\n lines").encoded()).toEqual(
        "This has \r\n various \r\n new \r\n lines",
      );
    });
  });

  describe("decoding", () => {
    it("should convert all new lines to crlf", () => {
      expect(new Body("This has \n various \r new \r\n lines").decoded()).toEqual(
        "This has \n various \n new \n lines",
      );
    });
    it("should not change a body on decode if not given an encoding type to decode", () => {
      expect(new Body("The=3Dbody").decoded()).toEqual("The=3Dbody");
    });
    it("should change return the raw text if it does not recognise the encoding", () => {
      const body = new Body("The=3Dbody");
      body.setEncoding("7bit");
      expect(body.decoded()).toEqual("The=3Dbody");
    });
    it("should change a body on decode if given an encoding type to decode", () => {
      const body = new Body("The=3Dbody");
      body.setEncoding("quoted-printable");
      expect(body.toString()).toEqual("The=body");
    });
    it("should change a body on decode if given an encoding type to decode", () => {
      const body = new Body("VGhlIGJvZHk=\n");
      body.setEncoding("base64");
      expect(body.toString()).toEqual("The body");
    });
  });

  describe("splitting up a multipart document", () => {
    const multipartBody =
      "this is some text\r\n\r\n------=_Part_2192_32400445\r\nContent-Type: text/plain; charset=ISO-8859-1\r\n\r\nThis is a plain text\r\n\r\n------=_Part_2192_32400445\r\nContent-Type: text/html\r\n\r\n<p>This is HTML</p>\r\n------=_Part_2192_32400445--\r\n";

    it("should keep track of its parts", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.parts.length).toEqual(2);
    });

    it("should keep the preamble text as its own preamble", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.preamble).toEqual("this is some text");
    });
  });

  describe("detecting non ascii", () => {
    it("should say an empty string is all ascii", () => {
      expect(new Body().isAsciiOnly()).toBeTruthy();
    });
    it("should say if a body is ascii", () => {
      expect(new Body("This is ASCII").isAsciiOnly()).toBeTruthy();
    });
    it("should say if a body is not ascii", () => {
      expect(new Body("This is NOT plain text ASCII　− かきくけこ").isAsciiOnly()).toBeFalsy();
    });
  });

  describe("matching", () => {
    it("should still equal itself", () => {
      const body = new Body("The body");
      expect(body).toEqual(body);
    });
    it("should match on the body part decoded if given a string to ==", () => {
      expect(new Body("The body").equals("The body")).toBeTruthy();
    });
    it("should match on the body part decoded if given a string to =~", () => {
      expect(new Body("The body").matchOperator(/The/)).toEqual(0);
    });
    it("should match on the body part decoded if given a string to match", () => {
      expect(new Body("The body").match(/The/)![0]).toEqual("The");
    });
    it("should match on the body part decoded if given a string to include?", () => {
      expect(new Body("The Body").decoded()).toContain("The");
    });
  });

  describe("non US-ASCII charset", () => {
    it("should encoded", () => {
      const body = new Body("あいうえお\r\n");
      body.charset = "iso-2022-jp";
      expect(new TextDecoder().decode(body.encoded() as Uint8Array)).toEqual(
        '\x1b$B$"$$$&$($*\x1b(B\r\n',
      );
    });
  });

  describe("invalid encoding", () => {
    it("should round trip", () => {
      const body = new Body("The Body");
      body.setEncoding("invalid");
      expect(body.encoded()).toEqual("The Body");
    });
  });

  describe("Partslist empty", () => {
    it("should not break on empty PartsList on body", () => {
      const body = new Body("The Body");
      body.sortPartsBang();
      expect(body.parts.length).toEqual(0);
    });
  });
});
