import { afterEach, describe, expect, it } from "vitest";
import {
  Base,
  FixtureResolver,
  LookupContext,
  Template,
  TseHandler,
} from "@blazetrails/actionview";
import "../../namespaces.js";
import { EXTENSION_LOOKUP, LOOKUP, Mime, MimeType } from "./mime-type.js";

describe("ActionView::Template::Types once Action Dispatch loads", () => {
  afterEach(() => {
    MimeType.unregister(":foobar");
  });

  it("is the Mime registry", () => {
    expect(Template.Types).toBe(Mime);
  });

  it("reflects a Mime::Type.register in its colon-spelled symbols", () => {
    MimeType.register("text/foobar", ":foobar");
    expect(Template.Types.symbols()).toContain(":foobar");
    expect(Template.Types.isValidSymbols([":html", ":foobar"])).toBe(true);
  });

  it("drops an unregistered format from Base.defaultFormats, which aliases Mime::SET.symbols (action_dispatch.rb:150)", () => {
    MimeType.register("text/foobar", ":foobar");
    expect(Base.defaultFormats).toBe(MimeType.SET.symbols);
    expect(Base.defaultFormats).toContain(":foobar");
    MimeType.unregister(":foobar");
    expect(Base.defaultFormats).not.toContain(":foobar");
  });

  it("resolves a template in a format the registration added", () => {
    MimeType.register("text/foobar", ":foobar");
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([new FixtureResolver({ "posts/index.foobar.tse": "foo" })]);
    lookupContext.formats = [":foobar"];
    expect((lookupContext.findTemplate("index", ["posts"]) as Template).format).toBe(":foobar");
  });

  it("answers Template#type as the Mime::Type, which the TSE escape_ignore_list matches (erb.rb:82)", () => {
    const template = new Template("<%= name %>", "t", new TseHandler(), {
      locals: [],
      format: ":text",
    });
    expect(template.type).toBe(Mime.get(":text"));
    expect(new TseHandler().call(template, template.source)).toMatch(
      /_ob\.safeExprAppend\( name \)/,
    );
  });
});

describe("Mime::Type.lookup_by_extension", () => {
  it("reads EXTENSION_LOOKUP with no leading-dot normalization (mime_type.rb:175-177)", () => {
    expect(MimeType.lookupByExtension("html")).toBe(MimeType.HTML);
    expect(MimeType.lookupByExtension(".html")).toBeUndefined();
  });
});

describe("Mime::Type.register fills LOOKUP and EXTENSION_LOOKUP separately (mime_type.rb:186-198)", () => {
  afterEach(() => {
    MimeType.unregister(":foobar");
  });

  it("keys LOOKUP by the media type and its synonyms, never the symbol", () => {
    const mime = MimeType.register("text/foobar", ":foobar", ["text/foo"], ["fb"]);
    expect(LOOKUP.get("text/foobar")).toBe(mime);
    expect(LOOKUP.get("text/foo")).toBe(mime);
    expect(LOOKUP.has("foobar")).toBe(false);
    expect(LOOKUP.has(":foobar")).toBe(false);
    expect(EXTENSION_LOOKUP.get("foobar")).toBe(mime);
    expect(EXTENSION_LOOKUP.get("fb")).toBe(mime);
    expect(EXTENSION_LOOKUP.has("text/foobar")).toBe(false);
  });

  it("skips LOOKUP for register_alias, so lookup keeps answering the original type", () => {
    const alias = MimeType.registerAlias("application/xhtml+xml", ":foobar", ["fb"]);
    expect(Mime.get(":foobar")).toBe(alias);
    expect(Mime.get("fb")).toBe(alias);
    expect(MimeType.lookup("application/xhtml+xml")).toBe(MimeType.HTML);
  });

  it("sweeps both maps on unregister", () => {
    MimeType.register("text/foobar", ":foobar", ["text/foo"]);
    MimeType.unregister(":foobar");
    expect(LOOKUP.has("text/foobar")).toBe(false);
    expect(LOOKUP.has("text/foo")).toBe(false);
    expect(EXTENSION_LOOKUP.has("foobar")).toBe(false);
  });
});
