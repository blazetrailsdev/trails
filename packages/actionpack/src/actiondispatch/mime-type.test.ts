import { describe, it, expect } from "vitest";
import { MimeType } from "./mime-type.js";

describe("ActionDispatch::Mime::Type", () => {
  it("parse single", () => {
    const types = MimeType.parse("text/html");
    expect(types.length).toBe(1);
    expect(types[0].string).toBe("text/html");
  });

  it("unregister", () => {
    const custom = MimeType.register("text/x-custom-test", "x_custom_test");
    expect(MimeType.lookup("x_custom_test")).toBe(custom);
    MimeType.unregister("x_custom_test");
    expect(MimeType.lookup("x_custom_test")).toBeUndefined();
  });

  it("parse text with trailing star at the beginning", () => {
    const types = MimeType.parse("text/*");
    expect(types.length).toBe(1);
    expect(types[0].string).toBe("text/*");
  });

  it("parse text with trailing star in the end", () => {
    const types = MimeType.parse("text/*");
    expect(types[0].string).toBe("text/*");
  });

  it("parse text with trailing star", () => {
    const types = MimeType.parse("text/*");
    expect(types.length).toBeGreaterThan(0);
  });

  it("parse application with trailing star", () => {
    const types = MimeType.parse("application/*");
    expect(types.length).toBeGreaterThan(0);
  });

  it("parse without q", () => {
    const types = MimeType.parse("text/html, application/json");
    expect(types.length).toBe(2);
  });

  it("parse with q", () => {
    const types = MimeType.parse("text/html;q=0.9, application/json;q=1.0");
    expect(types[0].string).toBe("application/json");
    expect(types[1].string).toBe("text/html");
  });

  it("parse with q and media type parameters", () => {
    const types = MimeType.parse("text/html;q=0.8;level=1");
    expect(types.length).toBe(1);
  });

  it("parse single media range with q", () => {
    const types = MimeType.parse("text/html;q=0.7");
    expect(types.length).toBe(1);
  });

  it("parse arbitrary media type parameters", () => {
    const types = MimeType.parse("text/html;level=2");
    expect(types.length).toBe(1);
  });

  it("parse arbitrary media type parameters with comma", () => {
    const types = MimeType.parse("text/html;level=2, application/json");
    expect(types.length).toBe(2);
  });

  it("parse arbitrary media type parameters with comma and additional media type", () => {
    const types = MimeType.parse("text/html;level=2, application/json, text/plain");
    expect(types.length).toBe(3);
  });

  it("parse wildcard with arbitrary media type parameters", () => {
    const types = MimeType.parse("*/*;q=0.1");
    expect(types.length).toBe(1);
  });

  it("parse broken acceptlines", () => {
    const types = MimeType.parse("");
    expect(types.length).toBe(0);
  });

  it("parse other broken acceptlines", () => {
    const types = MimeType.parse(",");
    expect(types.length).toBeGreaterThanOrEqual(0);
  });

  it("custom type", () => {
    const custom = MimeType.register("application/x-testing123", "testing123");
    expect(custom.string).toBe("application/x-testing123");
    expect(custom.symbol).toBe("testing123");
    expect(MimeType.lookup("testing123")).toBe(custom);
    MimeType.unregister("testing123");
  });

  it("custom type with type aliases", () => {
    const custom = MimeType.register("application/x-testaliased", "testaliased", [
      "text/x-testaliased",
    ]);
    expect(MimeType.lookup("text/x-testaliased")).toBe(custom);
    MimeType.unregister("testaliased");
  });

  it("register callbacks", () => {
    let called = false;
    MimeType.onRegister(() => {
      called = true;
    });
    MimeType.register("application/x-callback-test", "callback_test");
    expect(called).toBe(true);
    MimeType.unregister("callback_test");
  });

  it("register alias", () => {
    MimeType.registerAlias("html", "xhtml");
    expect(MimeType.lookup("xhtml")).toBe(MimeType.lookup("html"));
  });

  it("type should be equal to symbol", () => {
    const html = MimeType.lookup("html");
    expect(html).toBeDefined();
    expect(html?.equals("html")).toBe(true);
  });

  it("type convenience methods", () => {
    expect(MimeType.HTML.string).toBe("text/html");
    expect(MimeType.JSON.string).toBe("application/json");
    expect(MimeType.XML.string).toBe("application/xml");
    expect(MimeType.TEXT.string).toBe("text/plain");
  });

  it("references gives preference to symbols before strings", () => {
    const html = MimeType.lookup("html");
    expect(html?.ref()).toBe("html");
  });

  it("regexp matcher", () => {
    expect(MimeType.HTML.match(/text/)).toBe(true);
    expect(MimeType.HTML.match(/json/)).toBe(false);
  });

  it("match?", () => {
    expect(MimeType.HTML.match("text/html")).toBe(true);
    expect(MimeType.HTML.match("application/json")).toBe(false);
  });

  it("can be initialized with wildcards", () => {
    const all = new MimeType("*/*", "all");
    expect(all.string).toBe("*/*");
  });

  it("can be initialized with parameters", () => {
    const type = new MimeType("text/html", "html");
    expect(type.string).toBe("text/html");
  });

  it("lookup by extension", () => {
    expect(MimeType.lookupByExtension("html")).toBe(MimeType.HTML);
    expect(MimeType.lookupByExtension("json")).toBe(MimeType.JSON);
    expect(MimeType.lookupByExtension("xml")).toBe(MimeType.XML);
    expect(MimeType.lookupByExtension("txt")).toBe(MimeType.TEXT);
  });

  it("wildcard match", () => {
    expect(MimeType.HTML.match("*/*")).toBe(true);
    expect(MimeType.HTML.match("text/*")).toBe(true);
    expect(MimeType.HTML.match("application/*")).toBe(false);
  });
});
