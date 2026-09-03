import { describe, it, expect, beforeAll } from "vitest";
import { parse, _require } from "./nokogirisax.js";
import { parse as parseDom, _require as _requireDom } from "./nokogiri.js";
import { StringIO } from "@blazetrails/ruby-compat";

// trails-only coverage for the readable-IO and `eof?` arms of
// `XmlMini_NokogiriSAX#parse` (nokogirisax.rb:69-80) and
// `XmlMini_Nokogiri#parse` (nokogiri.rb:19-31); Rails exercises them through
// IO-backed request bodies, which have no counterpart in the package's tests.

// Rails' engine tests load the gem before the suite runs, via
// `XMLMiniEngineTest.run_with_gem("nokogiri")` (xml_mini_engine_test.rb:8-13).
beforeAll(async () => {
  await _require();
  await _requireDom();
});

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
