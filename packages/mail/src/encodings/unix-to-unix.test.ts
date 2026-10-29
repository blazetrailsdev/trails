import type {} from "@blazetrails/vitest-matchers";
import { b } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Encodings } from "../encodings.js";
import { UnixToUnix } from "./unix-to-unix.js";

describe("Mail::Encodings::UnixToUnix", () => {
  function decode(str: string) {
    return UnixToUnix.decode(str);
  }

  function encode(str: string | Uint8Array) {
    return UnixToUnix.encode(str);
  }

  it("is registered as uuencode", () => {
    expect(Encodings.getEncoding("uuencode")).toEqual(UnixToUnix);
  });

  it("is registered as x-uuencode", () => {
    expect(Encodings.getEncoding("x-uuencode")).toEqual(UnixToUnix);
  });

  it("is registered as x-uue", () => {
    expect(Encodings.getEncoding("x-uue")).toEqual(UnixToUnix);
  });

  it("can transport itself", () => {
    expect(UnixToUnix.canTransport(UnixToUnix)).toBeTruthy();
  });

  it("decodes", () => {
    const text = [
      "begin 644 Happy.txt",
      "M2&%P<'D@=&]D87D@9F]R('1O(&)E(&]N92!O9B!P96%C92!A;F0@<V5R96YE",
      "'('1I;64N\"@``",
      "`",
      "end",
      "",
    ].join("\n");
    expect(decode(text)).toEqualRuby("Happy today for to be one of peace and serene time.\n");
  });

  it("encodes", () => {
    expect(encode("Happy today")).toEqual("+2&%P<'D@=&]D87D`\n");
  });

  it("encodes / decodes non-ascii", () => {
    expect(encode("Happy ああr")).toEqual('-2&%P<\'D@XX&"XX&"<@``\n');
    expect(decode('-2&%P<\'D@XX&"XX&"<@``\n')).toEqual(b("Happy ああr"));
  });

  it("can read itself", () => {
    expect(decode(encode("Happy today"))).toEqualRuby("Happy today");
    expect(encode(decode("+2&%P<'D@=&]D87D`\n"))).toEqual("+2&%P<'D@=&]D87D`\n");
  });
});
