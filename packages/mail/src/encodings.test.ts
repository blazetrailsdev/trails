import { describe, expect, it } from "vitest";
import { Encoding } from "@blazetrails/ruby-compat";
import { Encodings } from "./encodings.js";
import "./index.js";
import { Utilities, type CharsetEncoder } from "./utilities.js";

const a = "This is あ string";
const b64 = "=?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?=";
const qp = "=?UTF-8?Q?This_is_=E3=81=82_string?=";

describe("Mail::Encodings", () => {
  describe("B encodings", () => {
    it("should accept other encodings", () => {
      expect(Encodings.bValueEncode(a)).toEqual(b64);
    });

    it("should correctly encode long string mixing with single/multi-byte characters", () => {
      const input = '意地悪 sample; = filename= name= "file" 笑.txt';
      const encoded = Encodings.decodeEncode(input, "encode");
      expect(Encodings.decodeEncode(encoded, "decode")).toEqual(input);
    });

    it("should decode UTF-16 encoded string", () => {
      expect(Encodings.valueDecode("=?UTF-16?B?MEIwRDBGMEgwSg==?=")).toEqual("あいうえお");
    });

    it("should decode UTF-32 encoded string", () => {
      expect(Encodings.valueDecode("=?UTF-32?B?AAAwQgAAMEQAADBGAAAwSAAAMEo=?=")).toEqual(
        "あいうえお",
      );
    });

    it("should decode a string, even with an invalid encoding name", () => {
      expect(Encodings.valueDecode("=?BAD-ENCODING?B?VEVTVA==?=")).toEqual("TEST");
    });

    it("should decode 8bit encoded string", () => {
      expect(Encodings.valueDecode("=?8bit?Q?ALPH=C3=89E?=")).toEqual("ALPHÉE");
    });

    it("should decode ks_c_5601-1987 encoded string", () => {
      expect(Encodings.valueDecode("=?ks_c_5601-1987?B?seggx/bB+A==?= <a@b.org>")).toEqual(
        "김 현진 <a@b.org>",
      );
    });

    it("should decode shift-jis encoded string", () => {
      expect(Encodings.valueDecode("=?shift-jis?Q?=93=FA=96{=8C=EA=?=")).toEqual("日本語");
    });

    it("should decode GB18030 encoded string misidentified as GB2312", () => {
      expect(Encodings.valueDecode("=?GB2312?B?6V8=?=")).toEqual("開");
    });

    it("should decode an invalid utf-7 byte sequence", () => {
      const string = "=?utf-7?B?aVBhZHMsIE1hY0Jvb2tzLCAmIG1vcmUgdXAgdG8gOTArQUNVLSBPZmY=?=";
      expect(Encodings.valueDecode(string)).toEqual("iPads, MacBooks, & more up to 90+ACU- Off");
    });
  });

  describe("Q encodings", () => {
    it("should accept other character sets", () => {
      expect(Encodings.qValueEncode(a)).toEqual(qp);
    });

    it("should decode an encoded string", () => {
      expect(Encodings.valueDecode(qp)).toEqual(a);
    });

    it("should decode a string ending with an unencoded question mark", () => {
      expect(Encodings.valueDecode("=?UTF-8?Q?=C3=A5???=")).toEqual("å??");
    });

    it("should treat unrecognized charsets as binary", () => {
      expect(Encodings.valueDecode("=?ISO-FOOO?Q?Morten_R=F8verdatt=E9r?=")).toEqual(
        "Morten R�verdatt�r",
      );
    });
  });

  describe("parameter MIME encodings", () => {
    it("should unencode an encoded string", () => {
      expect(Encodings.paramDecode("This%20is%20even%20more%20", "us-ascii")).toEqual(
        "This is even more ",
      );
    });

    it("should encode a string", () => {
      expect(Encodings.paramEncode("This is  あ string")).toEqual(
        "utf-8'en'This%20is%20%20%E3%81%82%20string",
      );
    });

    it("should just quote US-ASCII with spaces", () => {
      expect(Encodings.paramEncode("This is even more")).toEqual('"This is even more"');
    });

    it("should leave US-ASCII without spaces alone", () => {
      expect(Encodings.paramEncode("fun")).toEqual("fun");
    });
  });

  describe("unquote and convert to", () => {
    it("should unquote and change to an ISO encoding if we really want", () => {
      const b = Encodings.unquoteAndConvertTo("=?ISO-8859-1?Q?Brosch=FCre_Rand?=", "iso-8859-1");
      expect(b).toEqual(Uint8Array.from("Brosch\xfcre Rand", (c) => c.charCodeAt(0)));
    });

    it("handles Windows 1252 QP encoding", () => {
      const a = "=?WINDOWS-1252?Q?simple_=96_dash_=96_?=";
      expect(Encodings.unquoteAndConvertTo(a, "utf-8")).toEqual("simple – dash – ");
    });
  });

  describe("pre encoding non usascii text", () => {
    it("should encode a display name with us-ascii and non-usascii parts ignoring quotes", () => {
      const raw = '"Mikel Lindsああr" <mikel@test.lindsaar.net>';
      const encoded = "=?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>";
      expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
    });
  });

  describe("address encoding", () => {
    it("should encode emoji local part", () => {
      const encoded = "=?UTF-8?B?8J+Ym0BsaW5kc2Fhci5uZXQ=?=";
      expect(Encodings.encodeNonUsascii("😛@lindsaar.net", "utf-8")).toEqual(encoded);
    });

    it("should ignore nil in arrays", () => {
      expect(Encodings.addressEncode(["aa@bb.com", null], "utf-8")).toEqual("aa@bb.com");
    });
  });

  describe(".charset_encoder", () => {
    class CustomEncoder implements CharsetEncoder {
      encode(str: string | Uint8Array, charset: string): string {
        return `${typeof str === "string" ? str : new TextDecoder().decode(str)}-${charset}`;
      }
    }

    function withEncoder(encoder: CharsetEncoder, block: () => void): void {
      const old = Utilities.charsetEncoder;
      Utilities.charsetEncoder = encoder;
      try {
        block();
      } finally {
        Utilities.charsetEncoder = old;
      }
    }

    it("can use a custom encoder", () => {
      withEncoder(new CustomEncoder(), () => {
        expect(Encodings.valueDecode("=?utf-123?Q?xxx?=")).toEqual("xxx-utf-123");
      });
    });

    it("can convert ansi with best effort", () => {
      withEncoder(new Utilities.BestEffortCharsetEncoder(), () => {
        expect(Encodings.valueDecode("=?windows-1258?Q?SV=3A_Spr=F8sm=E5l_om_tilbod?=")).toEqual(
          "SV: Sprøsmål om tilbod",
        );
      });
    });
  });

  describe(".collapse_adjacent_encodings", () => {
    const convert = (from: string, to: string[]) =>
      expect(Encodings.collapseAdjacentEncodings(from)).toEqual(to);

    it("leaves blank intact", () => {
      convert("    ", ["    "]);
    });

    it("splits adjacent encodings into separate parts", () => {
      const x = "=?iso-2022-jp?B?X=?=";
      const y = "=?iso-2022-jp?B?Y=?=";
      convert(`A${x}${y}B`, ["A", x, y, "B"]);
    });
  });

  describe(".pick_encoding", () => {
    it("finds encoding", () => {
      expect(Utilities.pickEncoding("Windows-1252")).toEqual(Encoding.find("Windows-1252"));
    });

    it("uses binary for unfound", () => {
      expect(Utilities.pickEncoding("ISO-Foo")).toEqual(Encoding.BINARY);
    });
  });
});
