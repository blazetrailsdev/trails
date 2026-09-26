import { afterEach, describe, expect, it } from "vitest";
import { FixtureResolver, LookupContext, Template } from "@blazetrails/actionview";
import "../../namespaces.js";
import { Mime, MimeType } from "./mime-type.js";

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

  it("resolves a template in a format the registration added", () => {
    MimeType.register("text/foobar", ":foobar");
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([new FixtureResolver({ "posts/index.foobar.tse": "foo" })]);
    lookupContext.formats = [":foobar"];
    expect(lookupContext.findTemplate("index", ["posts"], [":foobar"])?.format).toBe(":foobar");
  });
});
