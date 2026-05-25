import { describe, it, expect } from "vitest";
import { parseFilename } from "./parse-filename.js";

const FORMATS = new Set(["html", "json", "xml", "js", "css", "text", "csv", "ics"]);

describe("parseFilename", () => {
  it("name only (no handler, no format) — defaults format to html", () => {
    expect(parseFilename("show", FORMATS)).toEqual({
      name: "show",
      locale: null,
      format: "html",
      variant: null,
      handler: null,
    });
  });

  it("name + handler — defaults format to html", () => {
    expect(parseFilename("show.tse", FORMATS)).toEqual({
      name: "show",
      locale: null,
      format: "html",
      variant: null,
      handler: "tse",
    });
  });

  it("name + format + handler", () => {
    expect(parseFilename("show.html.tse", FORMATS)).toEqual({
      name: "show",
      locale: null,
      format: "html",
      variant: null,
      handler: "tse",
    });
    expect(parseFilename("show.json.tse", FORMATS)).toEqual({
      name: "show",
      locale: null,
      format: "json",
      variant: null,
      handler: "tse",
    });
  });

  it("name + locale + format + handler", () => {
    expect(parseFilename("show.en.html.tse", FORMATS)).toEqual({
      name: "show",
      locale: "en",
      format: "html",
      variant: null,
      handler: "tse",
    });
  });

  it("name + format + variant + handler", () => {
    expect(parseFilename("show.html+phone.tse", FORMATS)).toEqual({
      name: "show",
      locale: null,
      format: "html",
      variant: "phone",
      handler: "tse",
    });
  });

  it("name + locale + format + variant + handler", () => {
    expect(parseFilename("show.en.html+phone.tse", FORMATS)).toEqual({
      name: "show",
      locale: "en",
      format: "html",
      variant: "phone",
      handler: "tse",
    });
  });

  it("directory prefix is preserved on name", () => {
    expect(parseFilename("users/show.html.tse", FORMATS)).toEqual({
      name: "users/show",
      locale: null,
      format: "html",
      variant: null,
      handler: "tse",
    });
  });

  it("unknown token between name and handler is kept in name", () => {
    // 'pdf' is not in FORMATS — treated as part of name
    expect(parseFilename("report.pdf.tse", FORMATS)).toEqual({
      name: "report.pdf",
      locale: null,
      format: "html",
      variant: null,
      handler: "tse",
    });
  });

  it("locale without explicit format — locale extracted, format defaults to html", () => {
    expect(parseFilename("show.en.tse", FORMATS)).toEqual({
      name: "show",
      locale: "en",
      format: "html",
      variant: null,
      handler: "tse",
    });
  });

  it("bare two-letter name is not consumed as locale (no remaining name token)", () => {
    // `en.tse`: only one token left after handler pop, guard prevents empty name
    expect(parseFilename("en.tse", FORMATS)).toEqual({
      name: "en",
      locale: null,
      format: "html",
      variant: null,
      handler: "tse",
    });
    expect(parseFilename("en", FORMATS)).toEqual({
      name: "en",
      locale: null,
      format: "html",
      variant: null,
      handler: null,
    });
  });

  it("locale region variant", () => {
    expect(parseFilename("show.en-US.html.tse", FORMATS)).toEqual({
      name: "show",
      locale: "en-US",
      format: "html",
      variant: null,
      handler: "tse",
    });
  });
});
