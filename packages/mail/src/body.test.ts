import { describe, expect, it } from "vitest";
import { Body } from "./body.js";
import "./index.js";
import { Part } from "./part.js";

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
    function assertSplitInto(body: unknown, pre: string, epi: string, parts: number) {
      const b = new Body(body);
      b.splitBang("----=_Part_2192_32400445");
      expect(b.parts.length).toEqual(parts);
      expect(b.preamble).toEqual(pre);
      expect(b.epilogue).toEqual(epi);
    }

    const multipartBody =
      "this is some text\r\n\r\n------=_Part_2192_32400445\r\nContent-Type: text/plain; charset=ISO-8859-1\r\n\r\nThis is a plain text\r\n\r\n------=_Part_2192_32400445\r\nContent-Type: text/html\r\n\r\n<p>This is HTML</p>\r\n------=_Part_2192_32400445--\r\n";

    it("should store the boundary passed in", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.boundary).toEqual("----=_Part_2192_32400445");
    });

    it("should split at the boundry string given returning two message bodies", () => {
      const body = new Body(multipartBody);
      expect(body.splitBang("----=_Part_2192_32400445").parts.length).toEqual(2);
    });

    it("should split with missing closing boundary", () => {
      const multipartBody =
        "this is some text\r\n\r\n------=_Part_2192_32400445\r\nContent-Type: text/plain\r\n\r\nWhere is the closing boundary...\r\n";
      assertSplitInto(multipartBody, "this is some text", "", 1);
    });

    it("should not split with empty space after missing closing boundary", () => {
      const multipartBody =
        "this is some text\r\n\r\n------=_Part_2192_32400445\r\nContent-Type: text/plain\r\n\r\nWhere is the closing boundary...\r\n------=_Part_2192_32400445\r\n\r\n\r\n\r\n";
      assertSplitInto(multipartBody, "this is some text", "", 1);
    });

    it("should split with multiple parts and missing closing boundary", () => {
      const multipartBody =
        "this is some text\r\n\r\n------=_Part_2192_32400445\r\nContent-Type: text/plain\r\n\r\nExtra part 1\r\n------=_Part_2192_32400445\r\nContent-Type: text/plain\r\n\r\nWhere is the closing boundary...\r\n";
      assertSplitInto(multipartBody, "this is some text", "", 2);
    });

    it("should ignore blank parts", () => {
      const multipartBody =
        "this is some text\r\n\r\n------=_Part_2192_32400445\r\n\r\n\r\n------=_Part_2192_32400445\r\nContent-Type: text/plain\r\n\r\nWhere is the closing boundary...\r\n";
      assertSplitInto(multipartBody, "this is some text", "", 1);
    });

    it("should keep the preamble text as its own preamble", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.preamble).toEqual("this is some text");
    });

    it("should return the parts as their own messages", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.parts[0].constructor).toEqual(Part);
      expect(body.parts[1].constructor).toEqual(Part);
    });

    it("should return the first part as its own message", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.parts[0].contentType()).toEqual("text/plain; charset=ISO-8859-1");
    });

    it("should return the first part as its own message", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.parts[1].contentType()).toEqual("text/html");
    });

    it("should separate out its parts", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.isMultipart()).toBeTruthy();
    });

    it("should keep track of its parts", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      expect(body.parts.length).toEqual(2);
    });

    it("should round trip its parts", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      body.preamble = "Really! this is some text";
      body.epilogue = "And this is the end";
      const newBody = new Body(body.encoded());
      newBody.splitBang("----=_Part_2192_32400445");
      expect(newBody.parts.length).toEqual(2);
      expect(newBody.parts[0].decoded()).toEqual("This is a plain text\n");
      expect(newBody.parts[1].decoded()).toEqual("<p>This is HTML</p>");
      expect(newBody.preamble).toEqual("Really! this is some text");
      expect(newBody.epilogue).toEqual("And this is the end");
    });

    it("should allow you to change the boundary", () => {
      const body = new Body(multipartBody);
      body.splitBang("----=_Part_2192_32400445");
      body.boundary = "------=_MIMEPART";
      const newBody = new Body(body.encoded());
      newBody.splitBang("------=_MIMEPART");
      expect(newBody.parts.length).toEqual(2);
      expect(newBody.preamble).toEqual("this is some text");
    });

    it("should split if boundary is not set", () => {
      const multipartBody =
        '\n\n--\nDate: Thu, 01 Aug 2013 15:14:20 +0100\nMime-Version: 1.0\nContent-Type: text/plain\nContent-Transfer-Encoding: 7bit\nContent-Disposition: attachment;\n filename=""\nContent-ID: <51fa6d3cac796_d84e3fe5a58349e025683@local.mail>\n\n\n\n----';
      const body = new Body(multipartBody);
      expect(() => body.splitBang(null)).not.toThrow();
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
      expect(body).toEqualRuby(body);
    });

    it("should match on the body part decoded if given a string to ==", () => {
      const body = new Body("The body");
      expect(body.equals("The body")).toBeTruthy();
    });

    it("should match on the body part decoded if given a string to ==", () => {
      const body = new Body("VGhlIGJvZHk=\n");
      body.setEncoding("base64");
      expect(body.equals("The body")).toBeTruthy();
    });

    it("should match on the body part decoded if given a string to =~", () => {
      const body = new Body("The body");
      expect(body.matchOperator(/The/)).toEqual(0);
    });

    it("should match on the body part decoded if given a string to ==", () => {
      const body = new Body("VGhlIGJvZHk=\n");
      body.setEncoding("base64");
      expect(body.matchOperator(/The/)).toEqual(0);
    });

    it("should match on the body part decoded if given a string to match", () => {
      const body = new Body("The body");
      expect(body.match(/The/)![0]).toEqual("The");
    });

    it("should match on the body part decoded if given a string to match", () => {
      const body = new Body("VGhlIGJvZHk=\n");
      body.setEncoding("base64");
      expect(body.match(/The/)![0]).toEqual("The");
    });

    it("should match on the body part decoded if given a string to include?", () => {
      const body = new Body("The Body");
      expect(body).toInclude("The");
    });

    it("should match on the body part decoded if given a string to include?", () => {
      const body = new Body("VGhlIGJvZHk=\n");
      body.setEncoding("base64");
      expect(body).toInclude("The");
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
