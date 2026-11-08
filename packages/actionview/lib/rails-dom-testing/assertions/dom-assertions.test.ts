import { afterEach, describe, expect, it, vi } from "vitest";
import { Assertion, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, NotImplementedError } from "@blazetrails/ruby-compat";
import { Testing } from "../testing.js";
import { assertDomEqual, assertDomNotEqual } from "./dom-assertions.js";

function withDefaultHtmlVersion(version: string, block: () => void): void {
  const oldVersion = Testing.defaultHtmlVersion;
  try {
    Testing.defaultHtmlVersion = version;
    block();
  } finally {
    Testing.defaultHtmlVersion = oldVersion;
  }
}

describe("DomAssertionsTest", () => {
  it("responds to assert dom equal", () => {
    expect(typeof assertDomEqual === "function").toBeTruthy();
  });

  it("dom equal", () => {
    const html = "<a></a>";
    assertDomEqual(html, `${html}`);
  });

  it("equal doms with different order attributes", () => {
    const attributes = `<a b="hello" c="hello"></a>`;
    const reverseAttributes = `<a c="hello" b="hello"></a>`;
    assertDomEqual(attributes, reverseAttributes);
  });

  it("dom not equal", () => {
    assertDomNotEqual("<a></a>", "<b></b>");
  });

  it("unequal doms attributes with different order and values", () => {
    const attributes = `<a b="hello" c="hello"></a>`;
    const reverseAttributes = `<a c="hello" b="goodbye"></a>`;
    assertDomNotEqual(attributes, reverseAttributes);
  });

  it("custom message is used in failures", async () => {
    const message = "This is my message.";

    const e = await assertRaises([Assertion], {}, () => {
      assertDomEqual("<a></a>", "<b></b>", message);
    });

    expect(e.message).toBe(message);
  });

  it("unequal dom attributes in children", () => {
    assertDomNotEqual(`<a><b c="1" /></a>`, `<a><b c="2" /></a>`);
  });

  it("dom equal with whitespace strict", () => {
    const canonical = `<a><b>hello</b> world</a>`;
    assertDomNotEqual(canonical, `<a>\n<b>hello\n </b> world</a>`, null, { strict: true });
    assertDomNotEqual(canonical, `<a> \n <b>\n hello</b> world</a>`, null, { strict: true });
    assertDomNotEqual(canonical, `<a>\n\t<b>hello</b> world</a>`, null, { strict: true });
    assertDomEqual(canonical, `<a><b>hello</b> world</a>`, null, { strict: true });
  });

  it("dom equal with whitespace", () => {
    const canonical = `<a><b>hello</b> world</a>`;
    assertDomEqual(canonical, `<a>\n<b>hello\n </b> world</a>`);
    assertDomEqual(canonical, `<a>\n<b>hello </b>\nworld</a>`);
    assertDomEqual(canonical, `<a> \n <b>\n hello</b> world</a>`);
    assertDomEqual(canonical, `<a> \n <b> hello </b>world</a>`);
    assertDomEqual(canonical, `<a> \n <b>hello </b>world\n</a>\n`);
    assertDomEqual(canonical, `<a>\n\t<b>hello</b> world</a>`);
    assertDomEqual(canonical, `<a>\n\t<b>hello </b>\n\tworld</a>`);
  });

  it("dom equal with attribute whitespace", () => {
    const canonical = `<div data-wow="Don't strip this">`;
    assertDomEqual(canonical, `<div data-wow="Don't strip this">`);
    assertDomNotEqual(canonical, `<div data-wow="Don't  strip this">`);
  });

  it("dom equal with indentation", () => {
    const canonical = `<a>hello <b>cruel</b> world</a>`;
    assertDomEqual(canonical, `<a>\n  hello\n  <b>cruel</b>\n  world\n</a>\n`);

    assertDomEqual(canonical, `<a>\nhello\n<b>cruel</b>\nworld\n</a>\n`);

    assertDomEqual(canonical, `<a>hello\n  <b>\n    cruel\n  </b>\n  world</a>\n`);
  });

  it("dom equal with surrounding whitespace", () => {
    const canonical = `<p>Lorem ipsum dolor</p><p>sit amet, consectetur adipiscing elit</p>`;
    assertDomEqual(
      canonical,
      `<p>\n  Lorem\n  ipsum\n  dolor\n</p>\n\n<p>\n  sit amet,\n  consectetur\n  adipiscing elit\n</p>\n`,
    );
  });

  it("dom not equal with interior whitespace", () => {
    const withSpace = `<a><b>hello world</b></a>`;
    const withoutSpace = `<a><b>helloworld</b></a>`;
    assertDomNotEqual(withSpace, withoutSpace);
  });
});

describe("DomAssertionsHtmlParserSelectionTest", () => {
  const input = "<p>1<b>2<i>3</b>4</i>5</p>";
  const html4Result = "<p>1<b>2<i>3</i></b>45</p>";
  const html5Result = "<p>1<b>2<i>3</i></b><i>4</i>5</p>";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // PERMANENT-SKIP: CLAUDE.md, "DOM testing is HTML5 only": `Testing.defaultHtmlVersion` defaults to `:html5`.
  it.skip("default value is html4", () => {
    expect(Testing.defaultHtmlVersion).toBe(":html4");
  });

  // PERMANENT-SKIP: CLAUDE.md, "DOM testing is HTML5 only": every assertion parses with the HTML4 parser.
  it.skip("default html4, no version specified", () => {
    withDefaultHtmlVersion(":html4", () => {
      assertDomEqual(html4Result, input);
      assertDomNotEqual(html5Result, input);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "DOM testing is HTML5 only": every assertion parses with the HTML4 parser.
  it.skip("default html4, html4 specified", () => {
    withDefaultHtmlVersion(":html4", () => {
      assertDomEqual(html4Result, input, null, { htmlVersion: ":html4" });
      assertDomNotEqual(html5Result, input, null, { htmlVersion: ":html4" });
    });
  });

  it.skipIf(!Testing.isHtml5Support())("default html4, html5 specified", () => {
    withDefaultHtmlVersion(":html4", () => {
      assertDomEqual(html5Result, input, null, { htmlVersion: ":html5" });
      assertDomNotEqual(html4Result, input, null, { htmlVersion: ":html5" });
    });
  });

  it.skipIf(!Testing.isHtml5Support())("default html5, no version specified", () => {
    withDefaultHtmlVersion(":html5", () => {
      assertDomEqual(html5Result, input);
      assertDomNotEqual(html4Result, input);
    });
  });

  // PERMANENT-SKIP: CLAUDE.md, "DOM testing is HTML5 only": every assertion parses with the HTML4 parser.
  it.skip("default html5, html4 specified", () => {
    withDefaultHtmlVersion(":html5", () => {
      assertDomEqual(html4Result, input, null, { htmlVersion: ":html4" });
      assertDomNotEqual(html5Result, input, null, { htmlVersion: ":html4" });
    });
  });

  it.skipIf(!Testing.isHtml5Support())("default html5, html5 specified", () => {
    withDefaultHtmlVersion(":html5", () => {
      assertDomEqual(html5Result, input, null, { htmlVersion: ":html5" });
      assertDomNotEqual(html4Result, input, null, { htmlVersion: ":html5" });
    });
  });

  it("raise NotImplementedError html5 when not supported", () => {
    vi.spyOn(Testing, "isHtml5Support").mockReturnValue(false);
    withDefaultHtmlVersion(":html5", () => {
      expect(() => assertDomEqual("a", "b")).toThrow(NotImplementedError);
      expect(() => assertDomEqual("a", "b", null, { htmlVersion: ":html5" })).toThrow(
        NotImplementedError,
      );
    });
  });

  it("default set to invalid", () => {
    withDefaultHtmlVersion(":html9", () => {
      expect(() => assertDomEqual("a", "b")).toThrow(ArgumentError);
    });
  });

  it("invalid version specified", () => {
    expect(() => assertDomEqual("a", "b", null, { htmlVersion: ":html9" })).toThrow(
      new ArgumentError("html_version must be :html4 or :html5, received :html9"),
    );
  });
});
