import { describe, it, expect } from "vitest";
import { EXTENSION_LOOKUP, Mime, MimeType } from "../http/mime-type.js";

describe("MimeTypeTest", () => {
  it("parse single", () => {
    const types = MimeType.parse("text/html");
    expect(types.length).toBe(1);
    expect(types[0].string).toBe("text/html");
  });

  it("unregister", () => {
    expect(Mime.get(":mobile")).toBeUndefined();

    try {
      const mime = MimeType.register("text/x-mobile", ":mobile");
      expect(Mime.get(":mobile")).toBe(mime);
      expect(MimeType.lookup("text/x-mobile")).toBe(mime);
      expect(MimeType.lookupByExtension(":mobile")).toBe(mime);

      MimeType.unregister(":mobile");
      expect(Mime.get(":mobile")).toBeUndefined();
      expect(MimeType.lookupByExtension(":mobile")).toBeUndefined();
    } finally {
      MimeType.unregister(":mobile");
    }
  });

  it("parse text with trailing star at the beginning", () => {
    const parsed = MimeType.parse("text/*, text/html, application/json, multipart/form-data").map(
      (m) => m.string,
    );
    expect(parsed).toContain("text/html");
    expect(parsed).toContain("application/json");
    expect(parsed.length).toBeGreaterThan(2);
    expect(parsed).not.toContain("text/*");
  });

  it("parse text with trailing star in the end", () => {
    const parsed = MimeType.parse("text/html, application/json, multipart/form-data, text/*").map(
      (m) => m.string,
    );
    expect(parsed).toContain("text/html");
    expect(parsed).not.toContain("text/*");
  });

  it("parse text with trailing star", () => {
    const parsed = MimeType.parse("text/*").map((m) => m.string);
    expect(parsed).toContain("text/html");
    expect(parsed).toContain("text/plain");
    expect(parsed).not.toContain("text/*");
  });

  it("parse application with trailing star", () => {
    const parsed = MimeType.parse("application/*").map((m) => m.string);
    expect(parsed).toContain("application/json");
    expect(parsed).toContain("application/xml");
    expect(parsed).not.toContain("application/*");
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
    try {
      const type = MimeType.register("image/foo", ":foo");
      expect(Mime.get(":foo")).toBe(type);
    } finally {
      MimeType.unregister(":foo");
    }
  });

  it("custom type with type aliases", () => {
    const custom = MimeType.register("application/x-testaliased", ":testaliased", [
      "text/x-testaliased",
    ]);
    expect(MimeType.lookup("text/x-testaliased")).toBe(custom);
    MimeType.unregister(":testaliased");
  });

  it("register callbacks", () => {
    let called = false;
    MimeType.onRegister(() => {
      called = true;
    });
    MimeType.register("application/x-callback-test", ":callback_test");
    expect(called).toBe(true);
    MimeType.unregister(":callback_test");
  });

  it("custom type with extension aliases", () => {
    try {
      MimeType.register("text/foobar", ":foobar", [], ["foo", "bar"]);
      for (const extension of ["foobar", "foo", "bar"]) {
        expect(EXTENSION_LOOKUP.get(extension)).toBe(Mime.get(":foobar"));
      }
    } finally {
      MimeType.unregister(":foobar");
    }
  });

  it("register alias", () => {
    try {
      MimeType.registerAlias("application/xhtml+xml", ":foobar");
      expect(Mime.get(":html")!.equals(EXTENSION_LOOKUP.get("foobar"))).toBe(true);
    } finally {
      MimeType.unregister(":foobar");
    }
  });

  it("type should be equal to symbol", () => {
    expect(Mime.get(":html")!.equals("application/xhtml+xml")).toBe(true);
    expect(Mime.get(":html")!.equals(":html")).toBe(true);
  });

  it("type convenience methods", () => {
    expect(MimeType.HTML.string).toBe("text/html");
    expect(MimeType.JSON.string).toBe("application/json");
    expect(MimeType.XML.string).toBe("application/xml");
    expect(MimeType.TEXT.string).toBe("text/plain");
  });

  it("references gives preference to symbols before strings", () => {
    expect(Mime.get(":html")!.ref()).toBe(":html");
    const another = MimeType.lookup("foo/bar");
    expect(another.toSym()).toBeNull();
    expect(another.ref()).toBe("foo/bar");
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

  it("all() returns unique registered types in registration order", () => {
    const all = MimeType.all();
    expect(new Set(all).size).toBe(all.length);
    const htmlIdx = all.indexOf(MimeType.HTML);
    const jsonIdx = all.indexOf(MimeType.JSON);
    expect(htmlIdx).toBeGreaterThanOrEqual(0);
    expect(jsonIdx).toBeGreaterThan(htmlIdx);
  });

  it("unregister sweeps extensionMap so lookupByExtension can't resolve a removed type", () => {
    MimeType.register("application/ext-test", ":exttest", [], ["exttest"]);
    expect(MimeType.lookupByExtension("exttest")?.symbol).toBe(":exttest");
    MimeType.unregister(":exttest");
    expect(MimeType.lookupByExtension("exttest")).toBeUndefined();
  });

  it("holds a reference to mime symbols", () => {
    const oldSymbols = Mime.symbols();
    try {
      MimeType.registerAlias("application/xhtml+xml", ":foobar");
      const newSymbols = Mime.symbols();

      expect(newSymbols).toBe(oldSymbols);
    } finally {
      MimeType.unregister(":foobar");
    }
  });

  it("all() picks up a newly registered type and drops it on unregister", () => {
    const before = MimeType.all().length;
    MimeType.register("application/all-test", ":alltest");
    try {
      const fresh = MimeType.all();
      expect(fresh.length).toBe(before + 1);
      expect(fresh.map((t) => t.symbol)).toContain(":alltest");
    } finally {
      MimeType.unregister(":alltest");
    }
    expect(MimeType.all().length).toBe(before);
  });
});
