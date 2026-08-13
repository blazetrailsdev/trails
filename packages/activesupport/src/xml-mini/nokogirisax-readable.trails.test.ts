import { describe, it, expect } from "vitest";
import { parse } from "./nokogirisax.js";
import { parse as parseDom } from "./nokogiri.js";

// trails-only coverage for the readable-IO and `eof?` arms of
// `XmlMini_NokogiriSAX#parse` (nokogirisax.rb:69-80) and
// `XmlMini_Nokogiri#parse` (nokogiri.rb:19-31); Rails exercises them through
// IO-backed request bodies, which have no counterpart in the package's tests.
describe("NokogiriSAX parse readable input", () => {
  it("parses a readable input", async () => {
    const xml = '<products><book type="novel"><title>Dune</title></book></products>';
    expect(await parse(new Blob([xml]))).toEqual(await parse(xml));
    expect(await parseDom(new Blob([xml]))).toEqual(await parseDom(xml));
  });

  it("returns an empty hash for a readable input at eof", async () => {
    expect(await parse(new Blob([]))).toEqual({});
    expect(await parseDom(new Blob([]))).toEqual({});
  });
});
