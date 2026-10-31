import "@blazetrails/vitest-matchers";
import { describe, expect, it } from "vitest";
import { Encoding, unpack1 } from "@blazetrails/ruby-compat";
import { Encodings } from "./encodings.js";
import { Base64 } from "./encodings/base64.js";
import { QuotedPrintable } from "./encodings/quoted-printable.js";
import "./index.js";
import { Utilities, type CharsetEncoder } from "./utilities.js";

const a = "This is あ string";
const b64 = "=?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?=";
const qp = "=?UTF-8?Q?This_is_=E3=81=82_string?=";

describe("Mail::Encodings", () => {
  describe("B encodings", () => {
    it("should accept other encodings", () => {
      expect(Encodings.bValueEncode(a)).toEqual(b64);
      expect(Encodings.bValueEncode(a, "UTF-8")).toEqual(b64);
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
      expect(Encodings.qValueEncode(a, "UTF-8")).toEqual(qp);
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

  describe("altering an encoded text to decoded and visa versa", () => {
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

    it("uses converter for params", () => {
      withEncoder(new CustomEncoder(), () => {
        const result = Encodings.paramDecode(
          "'ja'%d0%91%d0%b5%d0%b7%d1%8b%d0%bc%d1%8f%d0%bd%d0%bd%d1%8b%d0%b912.png",
          "iso-2022-jp",
        );
        expect(result).toEqual("'ja'Безымянный12.png-iso-2022-jp");
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
    it("leaves blank intact", () => {
      expect(Encodings.collapseAdjacentEncodings("    ")).toEqual(["    "]);
    });

    it("splits adjacent encodings into separate parts", () => {
      const x = "=?iso-2022-jp?B?X=?=";
      const y = "=?iso-2022-jp?B?Y=?=";
      expect(Encodings.collapseAdjacentEncodings(`A${x}${y}B`)).toEqual(["A", x, y, "B"]);
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

describe("base64 Encoding", () => {
  it("should return true for base64", () => {
    expect(Encodings.isDefined("base64")).toBeTruthy();
  });
});
describe("base64 Encoding", () => {
  it("should return true for Base64", () => {
    expect(Encodings.isDefined("Base64")).toBeTruthy();
  });
});
describe("base64 Encoding", () => {
  it("should return true for :base64", () => {
    expect(Encodings.isDefined("base64")).toBeTruthy();
  });
});
describe("base64 Encoding", () => {
  it("should return the Base64 Encoding class", () => {
    expect(Encodings.getEncoding("Base64")).toEqual(Base64);
  });
});
describe("base64 Encoding", () => {
  it("should return the base64 Encoding class", () => {
    expect(Encodings.getEncoding("base64")).toEqual(Base64);
  });
});
describe("base64 Encoding", () => {
  it("should return the base64 Encoding class", () => {
    expect(Encodings.getEncoding("base64")).toEqual(Base64);
  });
});
describe("quoted-printable Encoding", () => {
  it("should return true for quoted-printable", () => {
    expect(Encodings.isDefined("quoted-printable")).toBeTruthy();
  });
});
describe("quoted-printable Encoding", () => {
  it("should return true for Quoted-Printable", () => {
    expect(Encodings.isDefined("Quoted-Printable")).toBeTruthy();
  });
});
describe("quoted-printable Encoding", () => {
  it("should return true for :quoted_printable", () => {
    expect(Encodings.isDefined("quoted_printable")).toBeTruthy();
  });
});
describe("quoted-printable Encoding", () => {
  it("should return the QuotedPrintable Encoding class", () => {
    expect(Encodings.getEncoding("quoted-printable")).toEqual(QuotedPrintable);
  });
});
describe("quoted-printable Encoding", () => {
  it("should return the QuotedPrintable Encoding class", () => {
    expect(Encodings.getEncoding("Quoted-Printable")).toEqual(QuotedPrintable);
  });
});
describe("quoted-printable Encoding", () => {
  it("should return the QuotedPrintable Encoding class", () => {
    expect(Encodings.getEncoding("quoted_printable")).toEqual(QuotedPrintable);
  });
});
describe("B encodings", () => {
  it("should decode a string that looks similar to an encoded string (contains '=?')", () => {
    const string = "1+1=?";
    expect(Encodings.valueDecode(string)).toEqual(string);
  });
});
describe("B encodings", () => {
  it("should parse adjacent encoded-words separated by linear white-space", () => {
    const string =
      "=?utf-8?B?0L3QvtCy0YvQuSDRgdC+0YLRgNGD0LTQvdC40Log4oCUINC00L7RgNC+0YQ=?=\n =?utf-8?B?0LXQtdCy?=";
    const result = "новый сотрудник — дорофеев";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("B encodings", () => {
  it("should parse adjacent words with no space", () => {
    const string =
      "=?utf-8?B?0L3QvtCy0YvQuSDRgdC+0YLRgNGD0LTQvdC40Log4oCUINC00L7RgNC+0YQ=?==?utf-8?B?0LXQtdCy?=";
    const result = "новый сотрудник — дорофеев";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("B encodings", () => {
  it("should collapse adjacent words with multiple encodings on one line seperated by non-spaces", () => {
    const string =
      "Re:[=?iso-2022-jp?B?GyRCJTAlayE8JV0lcyEmJTglYyVRJXMzdDwwMnEbKEI=?=\n =?iso-2022-jp?B?GyRCPFIbKEI=?=] =?iso-2022-jp?B?GyRCSlY/LiEnGyhC?=\n  =?iso-2022-jp?B?GyRCIVolMCVrITwlXSVzIVskKkxkJCQ5ZyRvJDsbKEI=?=\n =?iso-2022-jp?B?GyRCJE43byRLJEQkJCRGIUolaiUvJSglOSVIGyhC?=#1056273\n =?iso-2022-jp?B?GyRCIUsbKEI=?=";
    const result =
      "Re:[グルーポン・ジャパン株式会社] 返信：【グルーポン】お問い合わせの件について（リクエスト#1056273\n ）";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("B encodings", () => {
  it("should decode a blank string", () => {
    expect(Encodings.valueDecode("=?utf-8?B??=")).toEqual("");
  });
});
describe("Q encodings", () => {
  it("should decode a blank string", () => {
    expect(Encodings.valueDecode("=?utf-8?Q??=")).toEqual("");
  });
});
describe("Q encodings", () => {
  it("should decode a string with spaces", () => {
    expect(Encodings.valueDecode("=?utf-8?Q?a a?=")).toEqual("a a");
  });
});
describe("parameter MIME encodings", () => {
  it("should leave an unencoded string alone", () => {
    const string = "this isn't encoded";
    const result = "this isn't encoded";
    expect(Encodings.paramDecode(string, "us-ascii")).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should handle Base64 encoded ISO-2022-JP string", () => {
    const string = "ISO-2022-JP =?iso-2022-jp?B?GyRCJCQkPSRLITwkXiRrJEskSyE8JDgkJyQkJFQhPBsoQg==?=";
    const result = "ISO-2022-JP いそにーまるににーじぇいぴー";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("decoding", () => {
    it("should detect an encoded Base64 string and return the decoded string", () => {
      const string = "=?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?=";
      const result = "This is あ string";

      expect(Encodings.decodeEncode(string, "decode")).toEqual(result);
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("decoding", () => {
    it("should detect an encoded QP string and return the decoded string", () => {
      const string = "=?UTF-8?Q?This_is_=E3=81=82_string?=";
      const result = "This is あ string";

      expect(Encodings.decodeEncode(string, "decode")).toEqual(result);
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("decoding", () => {
    it("should detect an a string is already decoded and leave it alone", () => {
      const string = "This is あ string";
      const result = "This is あ string";

      expect(Encodings.decodeEncode(string, "decode")).toEqual(result);
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("encoding", () => {
    it("should encode a string into Base64", () => {
      const string = "This is あ string";
      const result = "=?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?=";

      expect(Encodings.decodeEncode(string, "encode")).toEqual(result);
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("encoding", () => {
    it("should leave a string that doesn't need encoding alone", () => {
      const string = "This is a string";
      const result = "This is a string";

      expect(Encodings.decodeEncode(string, "encode")).toEqual(result);
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should unquote quoted printable and convert to utf-8", () => {
      const a = "=?ISO-8859-1?Q?[166417]_Bekr=E6ftelse_fra_Rejsefeber?=";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual("[166417] Bekræftelse fra Rejsefeber");
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should unquote base64 and convert to utf-8", () => {
      const a = "=?ISO-8859-1?B?WzE2NjQxN10gQmVrcuZmdGVsc2UgZnJhIFJlanNlZmViZXI=?=";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual("[166417] Bekræftelse fra Rejsefeber");
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should handle no charset", () => {
      const a = "[166417]_Bekr=E6ftelse_fra_Rejsefeber";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual("[166417]_Bekr=E6ftelse_fra_Rejsefeber");
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should unquote multiple lines", () => {
      const a =
        "=?utf-8?q?Re=3A_=5B12=5D_=23137=3A_Inkonsistente_verwendung_von_=22Hin?==?utf-8?b?enVmw7xnZW4i?=";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual('Re: [12] #137: Inkonsistente verwendung von "Hinzufügen"');
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should unquote a string in the middle of the text", () => {
      const a = "Re: Photos =?ISO-8859-1?Q?Brosch=FCre_Rand?=";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual("Re: Photos Broschüre Rand");
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should unquote Shift_JIS QP with trailing =", () => {
      const a = "=?Shift_JIS?Q?=93=FA=96{=8C=EA=?=";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual("日本語");
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should recognize iso646-us", () => {
      const decoded = Encodings.valueDecode(
        "[kj] =?ISO646-US?Q?Re:_[kj]_[KJ]_Money_is_not_our_god_should_?=\r\n =?ISO646-US?Q?be_played_on_US_Tour...+_Elys=3Fe_Montmartre?=",
      );
      expect(decoded).toEqual(
        "[kj] Re: [kj] [KJ] Money is not our god should be played on US Tour...+ Elys?e Montmartre",
      );
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should unquote multiple strings in the middle of the text", () => {
      const a =
        "=?Shift_JIS?Q?=93=FA=96{=8C=EA=?= <a@example.com>, =?Shift_JIS?Q?=93=FA=96{=8C=EA=?= <b@example.com>";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual("日本語 <a@example.com>, 日本語 <b@example.com>");
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should handle multiline quoted headers with mixed content", () => {
      const a =
        "=?iso-2022-jp?B?GyRCP3AwQxsoQg==?=2=?iso-2022-jp?B?GyRCIiobKEI=?= =?iso-2022-jp?B?GyRCOkc2YUxnPj4kcj5+JGsySCQsJFskSCRzJEk4K0V2GyhC?= =?iso-2022-jp?B?GyRCJD8kaSRKJCQhKjxkJDckJCQzJEgkRyQ5JE0hI0Z8GyhC?= =?iso-2022-jp?B?GyRCS1wkTiQkJCQkSCQzJG0hIiRvJFMkNSRTJE5AJDMmGyhC?= =?iso-2022-jp?B?GyRCJCw8OiRvJGwkRCREJCIkazg9Ol8hIiRKJHMkSCQrGyhC?= =?iso-2022-jp?B?GyRCOGVAJCRLO0QkNSRNJFAhIkxeQk4kSiQkISokSCReGyhC?= =?iso-2022-jp?B?GyRCJF4kTztXJCYkTiRAISMbKEI=?=";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual(
        "瑞庵2→最近門松を飾る家がほとんど見当たらない！寂しいことですね。日本のいいところ、わびさびの世界が失われつつある現在、なんとか後世に残さねば、勿体ない！とままは思うのだ。",
      );
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should handle quoted string with mixed content that have a plain string at the end", () => {
      const a = "Der Kunde ist K=?utf-8?B?w7Y=?=nig";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual("Der Kunde ist König");
    });
  });
});
describe("altering an encoded text to decoded and visa versa", () => {
  describe("unquote and convert to", () => {
    it("should handle utf_8", () => {
      const a = "Der Kunde ist K=?utf_8?B?w7Y=?=nig";
      const b = Encodings.unquoteAndConvertTo(a, "utf-8");
      expect(b).toEqual("Der Kunde ist König");
    });
  });
});
describe("quoted printable encoding and decoding", () => {
  it("should handle underscores in the text", () => {
    const expected = "something_with_underscores";
    expect(
      new TextDecoder().decode(
        unpack1(QuotedPrintable.encode(expected), "M") as unknown as Uint8Array,
      ),
    ).toEqual(expected);
  });
});
describe("quoted printable encoding and decoding", () => {
  it("should handle underscores in the text", () => {
    const expected = "something with_underscores";
    expect(
      new TextDecoder().decode(
        unpack1(QuotedPrintable.encode(expected), "M") as unknown as Uint8Array,
      ),
    ).toEqual(expected);
  });
});
describe("quoted printable encoding and decoding", () => {
  it("should keep the underscores in the text", () => {
    const expected = "something_with_underscores";
    const encoded = QuotedPrintable.encode(expected);
    expect(QuotedPrintable.decode(encoded)).toEqualRuby(expected);
  });
});
describe("quoted printable encoding and decoding", () => {
  it("should handle a question mark in the text", () => {
    const encoded = "=?iso-8859-1?Q?Hello World?_-_How are you??=";
    expect(Encodings.valueDecode(encoded)).toEqual("Hello World? - How are you?");
  });
});
describe("pre encoding non usascii text", () => {
  it("should not change an ascii string", () => {
    const raw = "mikel@test.lindsaar.net";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(raw);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode a display that contains non usascii", () => {
    const raw = "Lindsああr <mikel@test.lindsaar.net>";
    const encoded = "=?UTF-8?B?TGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode a single token that contains non usascii", () => {
    const raw = "<mikelああ@test.lindsaar.net>";
    const encoded = Encodings.encodeNonUsascii(raw, "utf-8");
    expect(Encodings.valueDecode(encoded)).toEqual(raw);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode a display that contains non usascii with quotes as no quotes", () => {
    const raw = '"Lindsああr" <mikel@test.lindsaar.net>';
    const encoded = "=?UTF-8?B?TGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode a display name with us-ascii and non-usascii parts", () => {
    const raw = "Mikel Lindsああr <mikel@test.lindsaar.net>";
    const encoded = "Mikel =?UTF-8?B?TGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode a quoted display name with us-ascii and non-usascii that ends with a non-usascii part", () => {
    const raw = '"Marc André" <marc@test.lindsaar.net>';
    const encoded = "=?UTF-8?B?TWFyYyBBbmRyw6k=?= <marc@test.lindsaar.net>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode multiple addresses correctly", () => {
    const raw = '"Mikel Lindsああr" <mikel@test.lindsaar.net>, "あdあ" <ada@test.lindsaar.net>';
    const encoded =
      "=?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>, =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode multiple addresses correctly when noninitial address contains non-usascii chars", () => {
    const raw = '"Mikel Lindr" <mikel@test.lindsaar.net>, "あdあ" <ada@test.lindsaar.net>';
    const encoded =
      "Mikel Lindr <mikel@test.lindsaar.net>, =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode multiple unquoted addresses correctly", () => {
    const raw = "Mikel Lindsああr <mikel@test.lindsaar.net>, あdあ <ada@test.lindsaar.net>";
    const encoded =
      "Mikel =?UTF-8?B?TGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>, =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode multiple unquoted addresses correctly when noninitial address contains non-usascii chars", () => {
    const raw = "Mikel Lindsar <mikel@test.lindsaar.net>, あdあ <ada@test.lindsaar.net>";
    const encoded =
      "Mikel Lindsar <mikel@test.lindsaar.net>, =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should encode multiple un bracketed addresses and groups correctly", () => {
    const raw =
      '"Mikel Lindsああr" test1@lindsaar.net, group: "あdあ" test2@lindsaar.net, me@lindsaar.net;';
    const encoded =
      "=?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= test1@lindsaar.net, group: =?UTF-8?B?44GCZOOBgg==?= test2@lindsaar.net, me@lindsaar.net;";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("pre encoding non usascii text", () => {
  it("should correctly match and encode non-usascii letters at the end of a quoted string", () => {
    const raw = '"Felix Baarß" <test@example.com>';
    const encoded = "=?UTF-8?B?RmVsaXggQmFhcsOf?= <test@example.com>";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("address encoding", () => {
  it("should not do anything to a plain address", () => {
    const raw = "mikel@test.lindsaar.net";
    const encoded = "mikel@test.lindsaar.net";
    expect(Encodings.addressEncode(raw, "utf-8")).toEqual(encoded);
  });
});
describe("address encoding", () => {
  it("should encode an address correctly", () => {
    const raw = '"Mikel Lindsああr" <mikel@test.lindsaar.net>';
    const encoded = "=?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>";
    expect(Encodings.addressEncode(raw, "utf-8")).toEqual(encoded);
  });
});
describe("address encoding", () => {
  it("should encode multiple addresses correctly", () => {
    const raw = ['"Mikel Lindsああr" <mikel@test.lindsaar.net>', '"あdあ" <ada@test.lindsaar.net>'];
    const encoded =
      "=?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= <mikel@test.lindsaar.net>, =?UTF-8?B?44GCZOOBgg==?= <ada@test.lindsaar.net>";
    expect(Encodings.addressEncode(raw, "utf-8")).toEqual(encoded);
  });
});
describe("address encoding", () => {
  it("should encode unicode local part", () => {
    const raw = '"Mikel Lindsああr" tést1@lindsaar.net, group: "あdあ" <ßest2@lindsaar.net>;';
    const encoded =
      "=?UTF-8?B?TWlrZWwgTGluZHPjgYLjgYJy?= =?UTF-8?B?dMOpc3QxQGxpbmRzYWFyLm5ldCw=?= group: =?UTF-8?B?44GCZOOBgg==?= =?UTF-8?B?PMOfZXN0MkBsaW5kc2Fhci5uZXQ+Ow==?=";
    expect(Encodings.encodeNonUsascii(raw, "utf-8")).toEqual(encoded);
  });
});
describe("address encoding", () => {
  it("should handle a single ascii address correctly from a string", () => {
    const raw = ['"Mikel Lindsaar" <mikel@test.lindsaar.net>'];
    const encoded = '"Mikel Lindsaar" <mikel@test.lindsaar.net>';
    expect(Encodings.addressEncode(raw, "utf-8")).toEqual(encoded);
  });
});
describe("address encoding", () => {
  it("should handle multiple ascii addresses correctly from a string", () => {
    const raw = "Mikel Lindsaar <mikel@test.lindsaar.net>, Ada <ada@test.lindsaar.net>";
    const encoded = "Mikel Lindsaar <mikel@test.lindsaar.net>, Ada <ada@test.lindsaar.net>";
    expect(Encodings.addressEncode(raw, "utf-8")).toEqual(encoded);
  });
});
describe("address encoding", () => {
  it("should handle ascii addresses correctly as an array", () => {
    const raw = ["Mikel Lindsaar <mikel@test.lindsaar.net>", "Ada <ada@test.lindsaar.net>"];
    const encoded = "Mikel Lindsaar <mikel@test.lindsaar.net>, Ada <ada@test.lindsaar.net>";
    expect(Encodings.addressEncode(raw, "utf-8")).toEqual(encoded);
  });
});
describe("address encoding", () => {
  it("should ignore single nil", () => {
    expect(Encodings.addressEncode(null, "utf-8")).toBeNull();
  });
});
describe(".collapse_adjacent_encodings", () => {
  it("leaves pure unencoded intact", () => {
    expect(Encodings.collapseAdjacentEncodings("AB CD EF ?= =? G")).toEqual(["AB CD EF ?= =? G"]);
  });
});
describe(".collapse_adjacent_encodings", () => {
  it("does not modify 1 encoded", () => {
    expect(Encodings.collapseAdjacentEncodings("=?iso-2022-jp?B?X=?=")).toEqual([
      "=?iso-2022-jp?B?X=?=",
    ]);
  });
});
describe(".collapse_adjacent_encodings", () => {
  it("splits unencoded and encoded into separate parts", () => {
    expect(Encodings.collapseAdjacentEncodings("A=?iso-2022-jp?B?X=?=B")).toEqual([
      "A",
      "=?iso-2022-jp?B?X=?=",
      "B",
    ]);
  });
});
describe(".collapse_adjacent_encodings", () => {
  it("splits adjacent encodings without unencoded into separate parts", () => {
    expect(Encodings.collapseAdjacentEncodings("=?iso-2022-jp?B?X=?==?iso-2022-jp?B?Y=?=")).toEqual(
      ["=?iso-2022-jp?B?X=?=", "=?iso-2022-jp?B?Y=?="],
    );
  });
});
describe(".collapse_adjacent_encodings", () => {
  it("does not join encodings when separated by unencoded", () => {
    expect(
      Encodings.collapseAdjacentEncodings("A=?iso-2022-jp?B?X=?=B=?iso-2022-jp?B?Y=?=C"),
    ).toEqual(["A", "=?iso-2022-jp?B?X=?=", "B", "=?iso-2022-jp?B?Y=?=", "C"]);
  });
});
describe(".collapse_adjacent_encodings", () => {
  it("does not join different encodings", () => {
    expect(Encodings.collapseAdjacentEncodings("A=?iso-2022-jp?B?X=?==?utf-8?B?Y=?=B")).toEqual([
      "A",
      "=?iso-2022-jp?B?X=?=",
      "=?utf-8?B?Y=?=",
      "B",
    ]);
  });
});
describe("B encodings", () => {
  it("should decode a long encoded string", () => {
    const string =
      "=?UTF-8?B?VGhpcyBpcyDjgYIgcmVhbGx5IGxvbmcgc3RyaW5nIFRoaXMgaXMg44GCIHJl?= =?UTF-8?B?YWxseSBsb25nIHN0cmluZyBUaGlzIGlzIOOBgiByZWFsbHkgbG9uZyBzdHJp?= =?UTF-8?B?bmcgVGhpcyBpcyDjgYIgcmVhbGx5IGxvbmcgc3RyaW5nIFRoaXMgaXMg44GC?= =?UTF-8?B?IHJlYWxseSBsb25nIHN0cmluZw==?=";
    const result =
      "This is あ really long string This is あ really long string This is あ really long string This is あ really long string This is あ really long string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("Q encodings", () => {
  it("should decode q encoded =5F as underscore", () => {
    const string = "=?UTF-8?Q?This_=C2=AD_and=5Fthat?=";
    const result = "This ­ and_that";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("parameter MIME encodings", () => {
  it("should unencoded an encoded string and return the right charset on 1.9", () => {
    const string = "This%20is%20even%20more%20";
    const result = "This is even more ";
    expect(Encodings.paramDecode(string, "us-ascii")).toEqual(result);
  });
});
describe("parameter MIME encodings", () => {
  it("should unencode a complete string that included unencoded parts", () => {
    const string = "This%20is%20even%20more%20%2A%2A%2Afun%2A%2A%2A%20isn't it";
    const result = "This is even more ***fun*** isn't it";
    expect(Encodings.paramDecode(string, "iso-8859-1")).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect an encoded Base64 string to the decoded string", () => {
    const string = "=?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?=";
    const result = "This is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect a multiple encoded Base64 string to the decoded string", () => {
    const string = "=?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?==?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?=";
    const result = "This is あ stringThis is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect a multiple encoded Base64 string with a space to the decoded string", () => {
    const string = "=?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?= =?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?=";
    const result = "This is あ stringThis is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect a multiple encoded Base64 string with a whitespace to the decoded string", () => {
    const string = "=?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?= \r\n =?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?=";
    const result = "This is あ stringThis is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should decode B and Q encodings together if needed", () => {
    const string =
      "=?UTF-8?Q?This_is_=E3=81=82_string?==?UTF-8?Q?This_is_=E3=81=82_string?= Some non encoded stuff =?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?= \r\n More non encoded stuff";
    const result =
      "This is あ stringThis is あ string Some non encoded stuff This is あ string \r\n More non encoded stuff";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect a encoded and unencoded Base64 string to the decoded string", () => {
    const string =
      "Some non encoded stuff =?UTF-8?B?VGhpcyBpcyDjgYIgc3RyaW5n?= \r\n More non encoded stuff";
    const result = "Some non encoded stuff This is あ string \r\n More non encoded stuff";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect an encoded QP string to the decoded string", () => {
    const string = "=?UTF-8?Q?This_is_=E3=81=82_string?=";
    const result = "This is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect multiple encoded QP string to the decoded string", () => {
    const string = "=?UTF-8?Q?This_is_=E3=81=82_string?==?UTF-8?Q?This_is_=E3=81=82_string?=";
    const result = "This is あ stringThis is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect multiple encoded QP string with a space to the decoded string", () => {
    const string = "=?UTF-8?Q?This_is_=E3=81=82_string?= =?UTF-8?Q?This_is_=E3=81=82_string?=";
    const result = "This is あ stringThis is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect multiple encoded QP string with a space to the decoded string", () => {
    const string = "=?UTF-8?Q?This_is_=E3=81=82_string?= \r\n =?UTF-8?Q?This_is_=E3=81=82_string?=";
    const result = "This is あ stringThis is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect a encoded and unencoded QP string to the decoded string", () => {
    const string =
      "Some non encoded stuff =?UTF-8?Q?This_is_=E3=81=82_string?= \r\n More non encoded stuff";
    const result = "Some non encoded stuff This is あ string \r\n More non encoded stuff";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});
describe("decoding a string and detecting the encoding type", () => {
  it("should detect a plain string and return it", () => {
    const string = "This is あ string";
    const result = "This is あ string";
    expect(Encodings.valueDecode(string)).toEqual(result);
  });
});

describe("B encodings", () => {
  it("should just return the string if us-ascii and asked to B encoded string", () => {
    expect(Encodings.bValueEncode("This is a string")).toEqual("This is a string");
  });
  it("should complain if there is no encoding passed for Ruby < 1.9", () => {
    expect(() => Encodings.bValueEncode("This is あ string")).not.toThrow();
  });
  it("should split the string up into bite sized chunks that can be wrapped easily", () => {
    const string =
      "This is あ really long string This is あ really long string This is あ really long string This is あ really long string This is あ really long string";
    expect(Encodings.bValueEncode(string)).toEqual(
      "=?UTF-8?B?VGhpcyBpcyDjgYIgcmVhbGx5IGxvbmcgc3RyaW5nIFRoaXMgaXMg44GCIHJl?= =?UTF-8?B?YWxseSBsb25nIHN0cmluZyBUaGlzIGlzIOOBgiByZWFsbHkgbG9uZyBzdHJp?= =?UTF-8?B?bmcgVGhpcyBpcyDjgYIgcmVhbGx5IGxvbmcgc3RyaW5nIFRoaXMgaXMg44GC?= =?UTF-8?B?IHJlYWxseSBsb25nIHN0cmluZw==?=",
    );
  });
});
describe("Q encodings", () => {
  it("should just return the string if us-ascii and asked to Q encoded string", () => {
    expect(Encodings.qValueEncode("This is a string")).toEqual("This is a string");
  });
  it("should complain if there is no encoding passed for Ruby < 1.9", () => {
    expect(() => Encodings.qValueEncode("This is あ string")).not.toThrow();
  });
});
describe("quoted printable encoding and decoding", () => {
  it("should handle a new line in the text", () => {
    const encoded = "=?ISO-8859-1?Q?\nRe=3A_ol=E1?=";
    expect(Encodings.valueDecode(encoded)).toEqual("\r\nRe: olá");
  });
});
describe(".collapse_adjacent_encodings", () => {
  it("does not keep the separator character between two different encodings", () => {
    for (const rfc1342Separator of ["\x0A", "\x20"]) {
      expect(
        Encodings.collapseAdjacentEncodings(
          `=?iso-2022-jp?B?X=?=${rfc1342Separator}=?utf-8?Q?Y=?=`,
        ),
      ).toEqual(["=?iso-2022-jp?B?X=?=", "=?utf-8?Q?Y=?="]);
    }
  });
});
