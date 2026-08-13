import { describe, it, expect } from "vitest";
import { backend, parse } from "../xml-mini.js";
import * as XmlMini_REXML from "./rexml.js";

describe("REXMLEngineTest", () => {
  it("default is rexml", () => {
    expect(backend()).toBe(XmlMini_REXML);
  });

  it("parse from empty string", async () => {
    expect(await parse("")).toEqual({});
  });

  it("parse from frozen string", async () => {
    const xmlString = "<root></root>";
    expect(await parse(xmlString)).toEqual({ root: {} });
  });
});
