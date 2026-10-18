import { describe, it, expect } from "vitest";
import { EXTENSION_LOOKUP, LOOKUP, Mime, MimeType } from "../http/mime-type.js";
import {
  assert,
  assertNot,
  assertEqual,
  assertNil,
  assertNotEqual,
  assertRespondTo,
  camelize,
} from "@blazetrails/activesupport";
import { rbInspect, symbolToS } from "@blazetrails/ruby-compat";

describe("MimeTypeTest", () => {
  it("parse single", () => {
    for (const mimeType of LOOKUP.keys()) {
      if (mimeType !== "image/*") {
        assertEqual([MimeType.lookup(mimeType)], MimeType.parse(mimeType));
      }
    }
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
    const accept = "text/*, text/html, application/json, multipart/form-data";
    const expected = [
      Mime.get(":html"),
      Mime.get(":text"),
      Mime.get(":js"),
      Mime.get(":css"),
      Mime.get(":ics"),
      Mime.get(":csv"),
      Mime.get(":vcf"),
      Mime.get(":vtt"),
      Mime.get(":xml"),
      Mime.get(":yaml"),
      Mime.get(":json"),
      Mime.get(":multipart_form"),
    ];
    const parsed = MimeType.parse(accept);
    assertEqual(
      expected.map((m) => m!.toString()),
      parsed.map((m) => m.toString()),
    );
  });

  it("parse text with trailing star in the end", () => {
    const accept = "text/html, application/json, multipart/form-data, text/*";
    const expected = [
      Mime.get(":html"),
      Mime.get(":json"),
      Mime.get(":multipart_form"),
      Mime.get(":text"),
      Mime.get(":js"),
      Mime.get(":css"),
      Mime.get(":ics"),
      Mime.get(":csv"),
      Mime.get(":vcf"),
      Mime.get(":vtt"),
      Mime.get(":xml"),
      Mime.get(":yaml"),
    ];
    const parsed = MimeType.parse(accept);
    assertEqual(
      expected.map((m) => m!.toString()),
      parsed.map((m) => m.toString()),
    );
  });

  it("parse text with trailing star", () => {
    const accept = "text/*";
    const expected = [
      Mime.get(":html"),
      Mime.get(":text"),
      Mime.get(":js"),
      Mime.get(":css"),
      Mime.get(":ics"),
      Mime.get(":csv"),
      Mime.get(":vcf"),
      Mime.get(":vtt"),
      Mime.get(":xml"),
      Mime.get(":yaml"),
      Mime.get(":json"),
    ];
    const parsed = MimeType.parse(accept);
    assertEqual(expected.map((m) => m!.toString()).sort(), parsed.map((m) => m.toString()).sort());
  });

  it("parse application with trailing star", () => {
    const accept = "application/*";
    const expected = [
      Mime.get(":html"),
      Mime.get(":js"),
      Mime.get(":xml"),
      Mime.get(":rss"),
      Mime.get(":atom"),
      Mime.get(":yaml"),
      Mime.get(":url_encoded_form"),
      Mime.get(":json"),
      Mime.get(":pdf"),
      Mime.get(":zip"),
      Mime.get(":gzip"),
    ];
    const parsed = MimeType.parse(accept);
    assertEqual(expected.map((m) => m!.toString()).sort(), parsed.map((m) => m.toString()).sort());
  });

  it("parse without q", () => {
    const types = MimeType.parse("text/html, application/json");
    expect(types.length).toBe(2);
  });

  it("parse with q", () => {
    const accept =
      "text/xml,application/xhtml+xml,text/yaml; q=0.3,application/xml,text/html; q=0.8,image/png,text/plain; q=0.5,application/pdf,*/*; q=0.2";
    const expected = [
      ...[":html", ":xml", ":png", ":pdf", ":text", ":yaml"].map((t) => Mime.get(t)!),
      "*/*",
    ];
    assertEqual(
      expected.map((m) => m.toString()),
      MimeType.parse(accept).map((m) => m.toString()),
    );
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
    const accept =
      "image/gif, image/x-xbitmap, image/jpeg, image/pjpeg, application/x-shockwave-flash, application/vnd.ms-excel, application/vnd.ms-powerpoint, application/msword,  , pronto/1.00.00, sslvpn/1.00.00.00, */*";
    const expected = [
      "image/gif",
      "image/x-xbitmap",
      "image/jpeg",
      "image/pjpeg",
      "application/x-shockwave-flash",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "application/msword",
      "pronto/1.00.00",
      "sslvpn/1.00.00.00",
      "*/*",
    ];
    assertEqual(
      expected,
      MimeType.parse(accept).map((m) => m.toString()),
    );
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

  it("custom type with url parameter", () => {
    const accept = 'application/vnd.api+json; profile="https://jsonapi.org/profiles/example"';
    try {
      const type = MimeType.register(accept, ":example_api");
      assertEqual(type, Mime.get(":example_api"));
      assertEqual([type], MimeType.parse(accept));
    } finally {
      MimeType.unregister(":example_api");
    }
  });

  it("register callbacks", () => {
    let called = false;
    MimeType.registerCallback(() => {
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
    const types = [...new Set(Mime.symbols())].filter((type) => type !== ":iphone");

    for (const type of types) {
      const mime = Mime.get(type)!;
      assertRespondTo(mime, `is${camelize(symbolToS(type))}`);
      assertEqual(type, mime.symbol, `${rbInspect(mime)} is not ${type}?`);
      const invalidTypes = types.filter((t) => t !== type && t !== ":html");
      for (const otherType of invalidTypes) {
        assertNotEqual(mime.symbol, otherType, `${rbInspect(mime)} is ${otherType}?`);
      }
    }
  });

  it("references gives preference to symbols before strings", () => {
    expect(Mime.get(":html")!.ref()).toBe(":html");
    const another = MimeType.lookup("foo/bar");
    assertNil(another.toSym());
    expect(another.ref()).toBe("foo/bar");
  });

  it("regexp matcher", () => {
    assert(Mime.get(":js")!.isMatch("text/javascript"));
    assert(Mime.get(":js")!.isMatch("application/javascript"));
    assert(!Mime.get(":js")!.isMatch("text/html"));
    assertNot(!Mime.get(":js")!.isMatch("text/javascript"));
    assertNot(!Mime.get(":js")!.isMatch("application/javascript"));
    assert(Mime.get(":html")!.isMatch("application/xhtml+xml"));
  });

  it("match?", () => {
    assert(Mime.get(":js")!.isMatch("text/javascript"));
    assert(Mime.get(":js")!.isMatch("application/javascript"));
    assertNot(Mime.get(":js")!.isMatch("text/html"));
  });

  it("can be initialized with wildcards", () => {
    assertEqual("*/*", new MimeType("*/*").toString());
    assertEqual("text/*", new MimeType("text/*").toString());
    assertEqual("video/*", new MimeType("video/*").toString());
  });

  it("can be initialized with parameters", () => {
    assertEqual("text/html; parameter", new MimeType("text/html; parameter").toString());
    assertEqual("text/html; parameter=abc", new MimeType("text/html; parameter=abc").toString());
    assertEqual(
      'text/html; parameter="abc"',
      new MimeType('text/html; parameter="abc"').toString(),
    );
    assertEqual(
      'text/html; parameter=abc; parameter2="xyz"',
      new MimeType('text/html; parameter=abc; parameter2="xyz"').toString(),
    );
  });

  it("can be initialized with parameters without having space after ;", () => {
    assertEqual("text/html;parameter", new MimeType("text/html;parameter").toString());
    assertEqual(
      'text/html;parameter=abc;parameter2="xyz"',
      new MimeType('text/html;parameter=abc;parameter2="xyz"').toString(),
    );
  });

  it("invalid mime types raise error", () => {
    expect(() => new MimeType("too/many/slash")).toThrow(MimeType.InvalidMimeType);
    expect(() => new MimeType("missingslash")).toThrow(MimeType.InvalidMimeType);
    expect(() => new MimeType("improper/semicolon;")).toThrow(MimeType.InvalidMimeType);
    expect(() => new MimeType('improper/semicolon; parameter=abc; parameter2="xyz";')).toThrow(
      MimeType.InvalidMimeType,
    );
    expect(() => new MimeType("text/html, text/plain")).toThrow(MimeType.InvalidMimeType);
    expect(() => new MimeType("*/html")).toThrow(MimeType.InvalidMimeType);
    expect(() => new MimeType("")).toThrow(MimeType.InvalidMimeType);
    expect(() => new MimeType(null)).toThrow(MimeType.InvalidMimeType);
    expect(
      () => new MimeType("text/html ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0 ;0;"),
    ).toThrow(MimeType.InvalidMimeType);
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
});
