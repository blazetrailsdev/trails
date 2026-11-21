import { describe, it, expect } from "vitest";
import { parse } from "../../lib/xml-mini/nokogirisax.js";
import { parse as parseDom } from "../../lib/xml-mini/nokogiri.js";
import { StringIO } from "@blazetrails/ruby-compat";

describe("NokogiriSAX parse readable input", () => {
  it("parses a readable input", async () => {
    const xml = '<products><book type="novel"><title>Dune</title></book></products>';
    expect(await parse(new StringIO(xml))).toEqual(await parse(xml));
    expect(await parseDom(new StringIO(xml))).toEqual(await parseDom(xml));
  });

  it("returns an empty hash for a readable input at eof", async () => {
    expect(await parse(new StringIO(""))).toEqual({});
    expect(await parseDom(new StringIO(""))).toEqual({});
  });
});
