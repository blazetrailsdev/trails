import { describe, it, expect, beforeAll } from "vitest";
import { parse, _require } from "./nokogirisax.js";
import { parse as parseDom, _require as _requireDom } from "./nokogiri.js";
import { StringIO } from "@blazetrails/ruby-compat";

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
