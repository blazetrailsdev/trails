import { describe, it, expect } from "vitest";
import { EXTENSION_LOOKUP, LOOKUP, Mime, MimeType } from "../http/mime-type.js";
import {
  assert,
  assertEqual,
  assertNot,
  assertNil,
  assertNotEqual,
  assertRespondTo,
  camelize,
} from "@blazetrails/activesupport";
import { rbInspect, symbolToS } from "@blazetrails/ruby-compat";

function assertOperator(o1: MimeType, op: "equals", o2: string): void {
  assert(o1[op](o2), `Expected ${String(o1)} to be ${op} ${o2}.`);
}

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
    const expect_ = [
      ":html",
      ":text",
      ":js",
      ":css",
      ":ics",
      ":csv",
      ":vcf",
      ":vtt",
      ":xml",
      ":yaml",
      ":json",
      ":multipart_form",
    ].map((sym) => String(Mime.get(sym)));
    const parsed = MimeType.parse(accept);
    expect(parsed.map(String)).toEqual(expect_);
  });

  it("parse text with trailing star in the end", () => {
    const accept = "text/html, application/json, multipart/form-data, text/*";
    const expect_ = [
      ":html",
      ":json",
      ":multipart_form",
      ":text",
      ":js",
      ":css",
      ":ics",
      ":csv",
      ":vcf",
      ":vtt",
      ":xml",
      ":yaml",
    ].map((sym) => String(Mime.get(sym)));
    const parsed = MimeType.parse(accept);
    expect(parsed.map(String)).toEqual(expect_);
  });

  it("parse text with trailing star", () => {
    const accept = "text/*";
    const expect_ = [
      ":html",
      ":text",
      ":js",
      ":css",
      ":ics",
      ":csv",
      ":vcf",
      ":vtt",
      ":xml",
      ":yaml",
      ":json",
    ].map((sym) => String(Mime.get(sym)));
    const parsed = MimeType.parse(accept);
    expect(parsed.map(String).sort()).toEqual(expect_.sort());
  });

  it("parse application with trailing star", () => {
    const accept = "application/*";
    const expect_ = [
      ":html",
      ":js",
      ":xml",
      ":rss",
      ":atom",
      ":yaml",
      ":url_encoded_form",
      ":json",
      ":pdf",
      ":zip",
      ":gzip",
    ].map((sym) => String(Mime.get(sym)));
    const parsed = MimeType.parse(accept);
    expect(parsed.map(String).sort()).toEqual(expect_.sort());
  });

  it("parse without q", () => {
    const types = MimeType.parse("text/html, application/json");
    expect(types.length).toBe(2);
  });

  it("parse with q", () => {
    const accept =
      "text/xml,application/xhtml+xml,text/yaml; q=0.3,application/xml,text/html; q=0.8,image/png,text/plain; q=0.5,application/pdf,*/*; q=0.2";
    const expect_ = [
      ...[":html", ":xml", ":png", ":pdf", ":text", ":yaml"].map((sym) => String(Mime.get(sym))),
      "*/*",
    ];
    expect(MimeType.parse(accept).map(String)).toEqual(expect_);
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
    const expect_ = [
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
    expect(MimeType.parse(accept).map(String)).toEqual(expect_);
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
    assertOperator(Mime.get(":html")!, "equals", "application/xhtml+xml");
    assertOperator(Mime.get(":html")!, "equals", ":html");
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
    expect(new MimeType("*/*").toString()).toBe("*/*");
    expect(new MimeType("text/*").toString()).toBe("text/*");
    expect(new MimeType("video/*").toString()).toBe("video/*");
  });

  it("can be initialized with parameters", () => {
    expect(new MimeType("text/html; parameter").toString()).toBe("text/html; parameter");
    expect(new MimeType("text/html; parameter=abc").toString()).toBe("text/html; parameter=abc");
    expect(new MimeType('text/html; parameter="abc"').toString()).toBe(
      'text/html; parameter="abc"',
    );
    expect(new MimeType('text/html; parameter=abc; parameter2="xyz"').toString()).toBe(
      'text/html; parameter=abc; parameter2="xyz"',
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
