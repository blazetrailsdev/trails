import { describe, it, expect } from "vitest";
import { Encoding } from "./encoding.js";
import { ArgumentError } from "./argument-error.js";

describe("Encoding.find", () => {
  it("resolves a canonical Ruby name to its Encoding", () => {
    expect(Encoding.find("UTF-8").name).toBe("UTF-8");
    expect(Encoding.find("Shift_JIS").name).toBe("Shift_JIS");
  });

  it("is case-insensitive, as enc_registered's case-folding table is", () => {
    expect(Encoding.find("utf-8")).toBe(Encoding.UTF_8);
    expect(Encoding.find("SHIFT_JIS").name).toBe("Shift_JIS");
  });

  it("resolves a Ruby alias to its canonical encoding", () => {
    expect(Encoding.find("BINARY")).toBe(Encoding.ASCII_8BIT);
    expect(Encoding.find("CP932").name).toBe("Windows-31J");
    expect(Encoding.find("646")).toBe(Encoding.US_ASCII);
    expect(Encoding.find("ISO8859-15").name).toBe("ISO-8859-15");
  });

  it("resolves the names TextDecoder rejects", () => {
    for (const name of ["ASCII-8BIT", "BINARY", "CP932", "CP949", "646"]) {
      expect(() => new TextDecoder(name)).toThrow();
      expect(Encoding.find(name)).toBeInstanceOf(Encoding);
    }
  });

  it("rejects a WHATWG-only label Ruby does not register", () => {
    expect(new TextDecoder("unicode-1-1-utf-8").encoding).toBe("utf-8");
    expect(() => Encoding.find("unicode-1-1-utf-8")).toThrow(ArgumentError);
  });

  it("raises ArgumentError: unknown encoding name - <name>", () => {
    expect(() => Encoding.find("no-such-encoding")).toThrow(
      "unknown encoding name - no-such-encoding",
    );
  });

  it("returns an Encoding argument unchanged, as enc_find's is_obj_encoding arm does", () => {
    expect(Encoding.find(Encoding.UTF_8)).toBe(Encoding.UTF_8);
  });

  it("renders as its name, and inspects as #<Encoding:name>", () => {
    expect(String(Encoding.UTF_8)).toBe("UTF-8");
    expect(Encoding.UTF_8.inspect()).toBe("#<Encoding:UTF-8>");
  });

  const MRI_NAME_LIST = [
    "646",
    "ANSI_X3.4-1968",
    "ASCII",
    "ASCII-8BIT",
    "BINARY",
    "Big5",
    "Big5-HKSCS",
    "Big5-HKSCS:2008",
    "Big5-UAO",
    "CESU-8",
    "CP1250",
    "CP1251",
    "CP1252",
    "CP1253",
    "CP1254",
    "CP1255",
    "CP1256",
    "CP1257",
    "CP1258",
    "CP437",
    "CP50220",
    "CP50221",
    "CP51932",
    "CP65000",
    "CP65001",
    "CP720",
    "CP737",
    "CP775",
    "CP850",
    "CP852",
    "CP855",
    "CP857",
    "CP860",
    "CP861",
    "CP862",
    "CP863",
    "CP864",
    "CP865",
    "CP866",
    "CP869",
    "CP874",
    "CP878",
    "CP932",
    "CP936",
    "CP949",
    "CP950",
    "CP951",
    "EUC-CN",
    "EUC-JIS-2004",
    "EUC-JISX0213",
    "EUC-JP",
    "EUC-KR",
    "EUC-TW",
    "Emacs-Mule",
    "GB12345",
    "GB18030",
    "GB1988",
    "GB2312",
    "GBK",
    "IBM037",
    "IBM437",
    "IBM720",
    "IBM737",
    "IBM775",
    "IBM850",
    "IBM852",
    "IBM855",
    "IBM857",
    "IBM860",
    "IBM861",
    "IBM862",
    "IBM863",
    "IBM864",
    "IBM865",
    "IBM866",
    "IBM869",
    "ISO-2022-JP",
    "ISO-2022-JP-2",
    "ISO-2022-JP-KDDI",
    "ISO-8859-1",
    "ISO-8859-10",
    "ISO-8859-11",
    "ISO-8859-13",
    "ISO-8859-14",
    "ISO-8859-15",
    "ISO-8859-16",
    "ISO-8859-2",
    "ISO-8859-3",
    "ISO-8859-4",
    "ISO-8859-5",
    "ISO-8859-6",
    "ISO-8859-7",
    "ISO-8859-8",
    "ISO-8859-9",
    "ISO2022-JP",
    "ISO2022-JP2",
    "ISO8859-1",
    "ISO8859-10",
    "ISO8859-11",
    "ISO8859-13",
    "ISO8859-14",
    "ISO8859-15",
    "ISO8859-16",
    "ISO8859-2",
    "ISO8859-3",
    "ISO8859-4",
    "ISO8859-5",
    "ISO8859-6",
    "ISO8859-7",
    "ISO8859-8",
    "ISO8859-9",
    "KOI8-R",
    "KOI8-U",
    "MacJapan",
    "MacJapanese",
    "PCK",
    "SJIS",
    "SJIS-DoCoMo",
    "SJIS-KDDI",
    "SJIS-SoftBank",
    "Shift_JIS",
    "TIS-620",
    "UCS-2BE",
    "UCS-4BE",
    "UCS-4LE",
    "US-ASCII",
    "UTF-16",
    "UTF-16BE",
    "UTF-16LE",
    "UTF-32",
    "UTF-32BE",
    "UTF-32LE",
    "UTF-7",
    "UTF-8",
    "UTF-8-HFS",
    "UTF-8-MAC",
    "UTF8-DoCoMo",
    "UTF8-KDDI",
    "UTF8-MAC",
    "UTF8-SoftBank",
    "Windows-1250",
    "Windows-1251",
    "Windows-1252",
    "Windows-1253",
    "Windows-1254",
    "Windows-1255",
    "Windows-1256",
    "Windows-1257",
    "Windows-1258",
    "Windows-31J",
    "Windows-874",
    "csWindows31J",
    "ebcdic-cp-us",
    "euc-jp-ms",
    "eucCN",
    "eucJP",
    "eucJP-ms",
    "eucKR",
    "eucTW",
    "external",
    "filesystem",
    "internal",
    "locale",
    "macCentEuro",
    "macCroatian",
    "macCyrillic",
    "macGreek",
    "macIceland",
    "macRoman",
    "macRomania",
    "macThai",
    "macTurkish",
    "macUkraine",
    "stateless-ISO-2022-JP",
    "stateless-ISO-2022-JP-KDDI",
  ];

  it("resolves every name MRI's Encoding.name_list carries, but internal", () => {
    expect(MRI_NAME_LIST.length).toBe(175);
    const unresolved = MRI_NAME_LIST.filter((name) => {
      try {
        return !(Encoding.find(name) instanceof Encoding);
      } catch {
        return true;
      }
    });
    expect(unresolved).toEqual(["internal"]);
  });

  it("leaves UTF-16 unlabelled: WHATWG's utf-16 is utf-16le, not MRI's BOM-dispatching dummy", () => {
    const beBom = new Uint8Array([0xfe, 0xff, 0x00, 0x41]);
    expect(new TextDecoder("utf-16").encoding).toBe("utf-16le");
    expect(new TextDecoder("utf-16").decode(beBom)).not.toBe("A");
    expect(Encoding.find("UTF-16").decoderLabel).toBeNull();
  });

  it("registers a name MRI carries but JS cannot decode, with a null decoderLabel", () => {
    for (const name of ["UTF-7", "EUC-TW", "Emacs-Mule", "IBM437", "SJIS-DoCoMo"]) {
      expect(Encoding.find(name).decoderLabel).toBeNull();
    }
  });
});
