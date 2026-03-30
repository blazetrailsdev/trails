/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  tag,
  contentTag,
  tokenList,
  classNames,
  cdataSection,
  escapeOnce,
} from "../helpers/tag-helper.js";
import { htmlSafe, SafeBuffer } from "@blazetrails/activesupport";
import { raw } from "../helpers/output-safety-helper.js";

const COMMON_DANGEROUS_CHARS = "&<>\"' %*+,/;=^|";
const INVALID_TAG_CHARS = "> /";

describe("TagHelperTest", () => {
  it("tag", () => {
    expect((tag("br") as SafeBuffer).toString()).toBe("<br />");
    expect((tag("br", { clear: "left" }) as SafeBuffer).toString()).toBe('<br clear="left" />');
    expect((tag("br", null, true) as SafeBuffer).toString()).toBe("<br>");
  });

  it("tag builder", () => {
    const t = tag() as any;
    expect(t.span().toString()).toBe("<span></span>");
    expect(t.span({ class: "bookmark" }).toString()).toBe('<span class="bookmark"></span>');
  });

  it("tag builder void tag", () => {
    const t = tag() as any;
    expect(t.br().toString()).toBe("<br>");
    expect(t.br({ class: "some_class" }).toString()).toBe('<br class="some_class">');
  });

  it("tag builder void tag with forced content", () => {
    const t = tag() as any;
    expect(() => t.br("some content")).toThrow();
  });

  it("tag builder void tag with empty content", () => {
    const t = tag() as any;
    expect(() => t.br("")).toThrow();
  });

  it("tag builder self closing tag", () => {
    const t = tag() as any;
    expect(t.svg(() => t.use({ href: "#cool-icon" })).toString()).toBe(
      '<svg><use href="#cool-icon" /></svg>',
    );
    expect(t.svg(() => t.circle({ cx: "5", cy: "5", r: "5" })).toString()).toBe(
      '<svg><circle cx="5" cy="5" r="5" /></svg>',
    );
    expect(t.animate_motion({ dur: "10s", repeatCount: "indefinite" }).toString()).toBe(
      '<animateMotion dur="10s" repeatCount="indefinite" />',
    );
  });

  it("tag builder self closing tag with content", () => {
    const t = tag() as any;
    expect(t.svg(() => t.circle({ r: "5" }, () => t.desc("A circle"))).toString()).toBe(
      '<svg><circle r="5"><desc>A circle</desc></circle></svg>',
    );
  });

  it("tag builder renders unknown html elements", () => {
    const t = tag() as any;
    expect(t.turbo_frame("Rendered", { id: "rendered" }).toString()).toBe(
      '<turbo-frame id="rendered">Rendered</turbo-frame>',
    );
  });

  it("tag builder is singleton", () => {
    expect(tag()).toBe(tag());
  });

  it("tag options rejects nil option", () => {
    expect((tag("p", { ignored: null }) as SafeBuffer).toString()).toBe("<p />");
  });

  it("tag builder options rejects nil option", () => {
    const t = tag() as any;
    expect(t.p({ ignored: null }).toString()).toBe("<p></p>");
  });

  it("tag options accepts false option", () => {
    expect((tag("p", { value: false }) as SafeBuffer).toString()).toBe('<p value="false" />');
  });

  it("tag builder options accepts false option", () => {
    const t = tag() as any;
    expect(t.p({ value: false }).toString()).toBe('<p value="false"></p>');
  });

  it("tag options accepts blank option", () => {
    expect((tag("p", { included: "" }) as SafeBuffer).toString()).toBe('<p included="" />');
  });

  it("tag builder options accepts blank option", () => {
    const t = tag() as any;
    expect(t.p({ included: "" }).toString()).toBe('<p included=""></p>');
  });

  it("tag options accepts symbol option when not escaping", () => {
    expect((tag("p", { value: "symbol" }, false, false) as SafeBuffer).toString()).toBe(
      '<p value="symbol" />',
    );
  });

  it("tag options accepts integer option when not escaping", () => {
    expect((tag("p", { value: 42 }, false, false) as SafeBuffer).toString()).toBe(
      '<p value="42" />',
    );
  });

  it("tag options converts boolean option", () => {
    const result = (
      tag("p", {
        disabled: true,
        itemscope: true,
        multiple: true,
        readonly: true,
        allowfullscreen: true,
        seamless: true,
        typemustmatch: true,
        sortable: true,
        default: true,
        inert: true,
        truespeed: true,
        allowpaymentrequest: true,
        nomodule: true,
        playsinline: true,
      }) as SafeBuffer
    ).toString();
    expect(result).toContain('disabled="disabled"');
    expect(result).toContain('itemscope="itemscope"');
    expect(result).toContain('multiple="multiple"');
    expect(result).toContain('readonly="readonly"');
    expect(result).toContain('allowfullscreen="allowfullscreen"');
    expect(result).toContain('seamless="seamless"');
    expect(result).toContain('typemustmatch="typemustmatch"');
    expect(result).toContain('sortable="sortable"');
    expect(result).toContain('default="default"');
    expect(result).toContain('inert="inert"');
    expect(result).toContain('truespeed="truespeed"');
    expect(result).toContain('allowpaymentrequest="allowpaymentrequest"');
    expect(result).toContain('nomodule="nomodule"');
    expect(result).toContain('playsinline="playsinline"');
  });

  it("tag builder options converts boolean option", () => {
    const t = tag() as any;
    const result = t
      .p({
        disabled: true,
        itemscope: true,
        multiple: true,
        readonly: true,
        allowfullscreen: true,
        seamless: true,
        typemustmatch: true,
        sortable: true,
        default: true,
        inert: true,
        truespeed: true,
        allowpaymentrequest: true,
        nomodule: true,
        playsinline: true,
      })
      .toString();
    expect(result).toContain('disabled="disabled"');
    expect(result).toContain('playsinline="playsinline"');
  });

  it("tag with dangerous name", () => {
    for (const char of INVALID_TAG_CHARS.split("").filter((c) => c !== " ")) {
      expect(() => tag(`asdf-${char}`)).toThrow();
    }
    // space
    expect(() => tag("asdf- ")).toThrow();
  });

  it("tag builder with dangerous name", () => {
    const t = tag() as any;
    for (const char of INVALID_TAG_CHARS.split("").filter((c) => c !== " ")) {
      const tagName = `asdf-${char}`;
      expect(() => t[tagName]()).toThrow();
    }
  });

  it("tag with dangerous aria attribute name", () => {
    const escapedDangerousChars = "_".repeat(COMMON_DANGEROUS_CHARS.length);
    expect(
      (
        tag("the-name", {
          aria: { [COMMON_DANGEROUS_CHARS]: "the value" },
        }) as SafeBuffer
      ).toString(),
    ).toBe(`<the-name aria-${escapedDangerousChars}="the value" />`);

    expect(
      (
        tag(
          "the-name",
          { aria: { [COMMON_DANGEROUS_CHARS]: "the value" } },
          false,
          false,
        ) as SafeBuffer
      ).toString(),
    ).toBe(`<the-name aria-${COMMON_DANGEROUS_CHARS}="the value" />`);
  });

  it("tag with dangerous data attribute name", () => {
    const escapedDangerousChars = "_".repeat(COMMON_DANGEROUS_CHARS.length);
    expect(
      (
        tag("the-name", {
          data: { [COMMON_DANGEROUS_CHARS]: "the value" },
        }) as SafeBuffer
      ).toString(),
    ).toBe(`<the-name data-${escapedDangerousChars}="the value" />`);

    expect(
      (
        tag(
          "the-name",
          { data: { [COMMON_DANGEROUS_CHARS]: "the value" } },
          false,
          false,
        ) as SafeBuffer
      ).toString(),
    ).toBe(`<the-name data-${COMMON_DANGEROUS_CHARS}="the value" />`);
  });

  it("tag with dangerous unknown attribute name", () => {
    const escapedDangerousChars = "_".repeat(COMMON_DANGEROUS_CHARS.length);
    expect(
      (
        tag("the-name", {
          [COMMON_DANGEROUS_CHARS]: "the value",
        }) as SafeBuffer
      ).toString(),
    ).toBe(`<the-name ${escapedDangerousChars}="the value" />`);

    expect(
      (
        tag("the-name", { [COMMON_DANGEROUS_CHARS]: "the value" }, false, false) as SafeBuffer
      ).toString(),
    ).toBe(`<the-name ${COMMON_DANGEROUS_CHARS}="the value" />`);
  });

  it("content tag", () => {
    expect(contentTag("a", "Create", { href: "create" }).toString()).toBe(
      '<a href="create">Create</a>',
    );
    expect(contentTag("a", "Create", { href: "create" }).htmlSafe).toBe(true);
    expect(contentTag("p", "<script>evil_js</script>").toString()).toBe(
      "<p>&lt;script&gt;evil_js&lt;/script&gt;</p>",
    );
    expect(contentTag("p", "<script>evil_js</script>", null, false).toString()).toBe(
      "<p><script>evil_js</script></p>",
    );
    expect(contentTag("div", "test", { "@click": "triggerNav()" }).toString()).toBe(
      '<div @click="triggerNav()">test</div>',
    );
  });

  it("tag builder with content", () => {
    const t = tag() as any;
    expect(t.div("Content", { id: "post_1" }).toString()).toBe('<div id="post_1">Content</div>');
    expect(t.div("Content", { id: "post_1" }).htmlSafe).toBe(true);
    expect(t.p("<script>evil_js</script>").toString()).toBe(
      "<p>&lt;script&gt;evil_js&lt;/script&gt;</p>",
    );
    expect(t.p("<script>evil_js</script>", { escape: false }).toString()).toBe(
      "<p><script>evil_js</script></p>",
    );
    expect(t.input({ pattern: /\w+/ }).toString()).toBe('<input pattern="\\w+">');
  });

  it("tag builder nested", () => {
    const t = tag() as any;
    expect(t.div(() => "content").toString()).toBe("<div>content</div>");
    expect(t.div({ id: "header" }, (tag: any) => tag.span("hello")).toString()).toBe(
      '<div id="header"><span>hello</span></div>',
    );
    expect(
      t
        .div({ id: "header" }, (tag: any) =>
          tag.div({ class: "world" }, (tag: any) => tag.span("hello")),
        )
        .toString(),
    ).toBe('<div id="header"><div class="world"><span>hello</span></div></div>');
  });

  it("content tag with block and options out of erb", () => {
    expect(contentTag("div", { class: "green" }, null, true, () => "Hello world!").toString()).toBe(
      '<div class="green">Hello world!</div>',
    );
  });

  it("tag builder with block and options out of erb", () => {
    const t = tag() as any;
    expect(t.div({ class: "green" }, () => "Hello world!").toString()).toBe(
      '<div class="green">Hello world!</div>',
    );
  });

  it("content tag with escaped array class", () => {
    let str = contentTag("p", "limelight", { class: ["song", "play>"] });
    expect(str.toString()).toBe('<p class="song play&gt;">limelight</p>');

    str = contentTag("p", "limelight", { class: ["song", "play"] });
    expect(str.toString()).toBe('<p class="song play">limelight</p>');

    str = contentTag("p", "limelight", { class: ["song", ["play"]] });
    expect(str.toString()).toBe('<p class="song play">limelight</p>');
  });

  it("tag builder with escaped array class", () => {
    const t = tag() as any;
    let str = t.p("limelight", { class: ["song", "play>"] });
    expect(str.toString()).toBe('<p class="song play&gt;">limelight</p>');

    str = t.p("limelight", { class: ["song", "play"] });
    expect(str.toString()).toBe('<p class="song play">limelight</p>');

    str = t.p("limelight", { class: ["song", ["play"]] });
    expect(str.toString()).toBe('<p class="song play">limelight</p>');
  });

  it("content tag with unescaped array class", () => {
    const str = contentTag("p", "limelight", { class: ["song", "play>"] }, false);
    expect(str.toString()).toBe('<p class="song play>">limelight</p>');
  });

  it("tag builder with unescaped array class", () => {
    const t = tag() as any;
    const str = t.p("limelight", { class: ["song", "play>"], escape: false });
    expect(str.toString()).toBe('<p class="song play>">limelight</p>');
  });

  it("content tag with empty array class", () => {
    const str = contentTag("p", "limelight", { class: [] });
    expect(str.toString()).toBe('<p class="">limelight</p>');
  });

  it("tag builder with empty array class", () => {
    const t = tag() as any;
    expect(t.p("limelight", { class: [] }).toString()).toBe('<p class="">limelight</p>');
  });

  it("content tag with unescaped empty array class", () => {
    const str = contentTag("p", "limelight", { class: [] }, false);
    expect(str.toString()).toBe('<p class="">limelight</p>');
  });

  it("tag builder with unescaped empty array class", () => {
    const t = tag() as any;
    const str = t.p("limelight", { class: [], escape: false });
    expect(str.toString()).toBe('<p class="">limelight</p>');
  });

  it("content tag with conditional hash classes", () => {
    let str = contentTag("p", "limelight", {
      class: { song: true, play: false },
    });
    expect(str.toString()).toBe('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", {
      class: [{ song: true }, { play: false }],
    });
    expect(str.toString()).toBe('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", {
      class: [{ song: true }, null, false],
    });
    expect(str.toString()).toBe('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", {
      class: ["song", { foo: false }],
    });
    expect(str.toString()).toBe('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", { class: [1, 2, 3] });
    expect(str.toString()).toBe('<p class="1 2 3">limelight</p>');

    str = contentTag("p", "limelight", {
      class: { song: true, play: true },
    });
    expect(str.toString()).toBe('<p class="song play">limelight</p>');

    str = contentTag("p", "limelight", {
      class: { song: false, play: false },
    });
    expect(str.toString()).toBe('<p class="">limelight</p>');
  });

  it("tag builder with conditional hash classes", () => {
    const t = tag() as any;
    let str = t.p("limelight", { class: { song: true, play: false } });
    expect(str.toString()).toBe('<p class="song">limelight</p>');

    str = t.p("limelight", {
      class: [{ song: true }, { play: false }],
    });
    expect(str.toString()).toBe('<p class="song">limelight</p>');

    str = t.p("limelight", { class: { song: true, play: true } });
    expect(str.toString()).toBe('<p class="song play">limelight</p>');

    str = t.p("limelight", { class: { song: false, play: false } });
    expect(str.toString()).toBe('<p class="">limelight</p>');
  });

  it("content tag with unescaped conditional hash classes", () => {
    const str = contentTag("p", "limelight", { class: { song: true, "play>": true } }, false);
    expect(str.toString()).toBe('<p class="song play>">limelight</p>');
  });

  it("tag builder with unescaped conditional hash classes", () => {
    const t = tag() as any;
    const str = t.p("limelight", {
      class: { song: true, "play>": true },
      escape: false,
    });
    expect(str.toString()).toBe('<p class="song play>">limelight</p>');
  });

  it("token list and class names", () => {
    for (const helper of [tokenList, classNames]) {
      expect(helper(["song", { play: true }]).toString()).toBe("song play");
      expect(helper({ song: true, play: false }).toString()).toBe("song");
      expect(helper([{ song: true }, { play: false }]).toString()).toBe("song");
      expect(helper({ song: true, play: false }).toString()).toBe("song");
      expect(helper([{ song: true }, null, false]).toString()).toBe("song");
      expect(helper(["song", { foo: false }]).toString()).toBe("song");
      expect(helper({ song: true, play: true }).toString()).toBe("song play");
      expect(helper({ song: false, play: false }).toString()).toBe("");
      expect(helper(null, "", false, 123, { song: false, play: false }).toString()).toBe("123");
      expect(helper("song", "song").toString()).toBe("song");
      expect(helper("song song").toString()).toBe("song");
      expect(helper("song\nsong").toString()).toBe("song");
    }
  });

  it("token list and class names returns an html safe string", () => {
    expect(tokenList("a value").htmlSafe).toBe(true);
    expect(classNames("a value").htmlSafe).toBe(true);
  });

  it("content tag with data attributes", () => {
    const result = contentTag("p", "limelight", {
      data: {
        number: 1,
        string: "hello",
        string_with_quotes: 'double"quote"party"',
      },
    });
    expect(result.toString()).toContain('data-number="1"');
    expect(result.toString()).toContain('data-string="hello"');
    expect(result.toString()).toContain(
      'data-string-with-quotes="double&quot;quote&quot;party&quot;"',
    );
  });

  it("tag builder with data attributes", () => {
    const t = tag() as any;
    const result = t.p("limelight", {
      data: {
        number: 1,
        string: "hello",
        string_with_quotes: 'double"quote"party"',
      },
    });
    expect(result.toString()).toContain('data-number="1"');
    expect(result.toString()).toContain('data-string="hello"');
    expect(result.toString()).toContain(
      'data-string-with-quotes="double&quot;quote&quot;party&quot;"',
    );
  });

  it("cdata section", () => {
    expect(cdataSection("<hello world>").toString()).toBe("<![CDATA[<hello world>]]>");
  });

  it("cdata section with string conversion", () => {
    expect(cdataSection(null).toString()).toBe("<![CDATA[]]>");
  });

  it("cdata section splitted", () => {
    expect(cdataSection("hello]]>world").toString()).toBe("<![CDATA[hello]]]]><![CDATA[>world]]>");
    expect(cdataSection("hello]]>world]]>again").toString()).toBe(
      "<![CDATA[hello]]]]><![CDATA[>world]]]]><![CDATA[>again]]>",
    );
  });

  it("escape once", () => {
    expect(escapeOnce("1 < 2 &amp; 3").toString()).toBe("1 &lt; 2 &amp; 3");
  });

  it("tag honors html safe for param values", () => {
    const values = ["1&amp;2", "1 &lt; 2", "&#8220;test&#8220;"];
    for (const escaped of values) {
      expect((tag("a", { href: htmlSafe(escaped) }) as SafeBuffer).toString()).toBe(
        `<a href="${escaped}" />`,
      );
      const t = tag() as any;
      expect(t.a({ href: htmlSafe(escaped) }).toString()).toBe(`<a href="${escaped}"></a>`);
    }
  });

  it("tag honors html safe with escaped array class", () => {
    expect((tag("p", { class: ["song>", raw("play>")] }) as SafeBuffer).toString()).toBe(
      '<p class="song&gt; play>" />',
    );
    expect((tag("p", { class: [raw("song>"), "play>"] }) as SafeBuffer).toString()).toBe(
      '<p class="song> play&gt;" />',
    );
  });

  it("tag builder honors html safe with escaped array class", () => {
    const t = tag() as any;
    expect(t.p({ class: ["song>", raw("play>")] }).toString()).toBe(
      '<p class="song&gt; play>"></p>',
    );
    expect(t.p({ class: [raw("song>"), "play>"] }).toString()).toBe(
      '<p class="song> play&gt;"></p>',
    );
  });

  it("tag does not honor html safe double quotes as attributes", () => {
    const result = contentTag("p", "content", {
      title: htmlSafe('"'),
    });
    expect(result.toString()).toBe('<p title="&quot;">content</p>');
  });

  it("data tag does not honor html safe double quotes as attributes", () => {
    const result = contentTag("p", "content", {
      data: { title: htmlSafe('"') },
    });
    expect(result.toString()).toBe('<p data-title="&quot;">content</p>');
  });

  it("skip invalid escaped attributes", () => {
    for (const escaped of ["&1;", "&#1dfa3;", "& #123;"]) {
      expect((tag("a", { href: escaped }) as SafeBuffer).toString()).toBe(
        `<a href="${escaped.replace(/&/g, "&amp;")}" />`,
      );
    }
  });

  it("disable escaping", () => {
    expect((tag("a", { href: "&amp;" }, false, false) as SafeBuffer).toString()).toBe(
      '<a href="&amp;" />',
    );
  });

  it("tag builder disable escaping", () => {
    const t = tag() as any;
    expect(t.a({ href: "&amp;", escape: false }).toString()).toBe('<a href="&amp;"></a>');
    expect(t.a({ href: "&amp;", escape: false }, () => "cnt").toString()).toBe(
      '<a href="&amp;">cnt</a>',
    );
    expect(t.br({ "data-hidden": "&amp;", escape: false }).toString()).toBe(
      '<br data-hidden="&amp;">',
    );
    expect(t.a("content", { href: "&amp;", escape: false }).toString()).toBe(
      '<a href="&amp;">content</a>',
    );
    expect(t.a({ href: "&amp;", escape: false }, () => "content").toString()).toBe(
      '<a href="&amp;">content</a>',
    );
  });

  it("data attributes", () => {
    const result = (
      tag("a", {
        data: {
          a_float: 3.14,
          a_number: 1,
          string: "hello",
          symbol: "foo",
          array: [1, 2, 3],
          hash: { key: "value" },
          string_with_quotes: 'double"quote"party"',
        },
      }) as SafeBuffer
    ).toString();
    expect(result).toContain('data-a-float="3.14"');
    expect(result).toContain('data-a-number="1"');
    expect(result).toContain('data-string="hello"');
    expect(result).toContain('data-symbol="foo"');
    expect(result).toContain('data-array="[1,2,3]"');
    expect(result).toContain('data-hash="{&quot;key&quot;:&quot;value&quot;}"');
    expect(result).toContain('data-string-with-quotes="double&quot;quote&quot;party&quot;"');
  });

  it("aria attributes", () => {
    const result = (
      tag("a", {
        aria: {
          nil: null,
          a_float: 3.14,
          a_number: 1,
          truthy: true,
          falsey: false,
          string: "hello",
          symbol: "foo",
          array: [1, 2, 3],
          empty_array: [],
          hash: { a: true, b: "truthy", falsey: false, nil: null },
          empty_hash: {},
          tokens: ["a", { b: true, c: false }],
          empty_tokens: [{ a: false }],
          string_with_quotes: 'double"quote"party"',
        },
      }) as SafeBuffer
    ).toString();
    expect(result).toContain('aria-a-float="3.14"');
    expect(result).toContain('aria-a-number="1"');
    expect(result).toContain('aria-truthy="true"');
    expect(result).toContain('aria-falsey="false"');
    expect(result).toContain('aria-string="hello"');
    expect(result).toContain('aria-symbol="foo"');
    expect(result).toContain('aria-array="1 2 3"');
    expect(result).not.toContain("aria-empty-array");
    expect(result).toContain('aria-hash="a b"');
    expect(result).not.toContain("aria-empty-hash");
    expect(result).toContain('aria-tokens="a b"');
    expect(result).not.toContain("aria-empty-tokens");
    expect(result).toContain('aria-string-with-quotes="double&quot;quote&quot;party&quot;"');
    expect(result).not.toContain("aria-nil");
  });

  it("link to data nil equal", () => {
    const div1 = contentTag("div", "test", {
      "data-tooltip": null,
    });
    const div2 = contentTag("div", "test", {
      data: { tooltip: null },
    });
    expect(div1.toString()).toBe(div2.toString());
  });

  it("tag builder link to data nil equal", () => {
    const t = tag() as any;
    const div1 = t.div("test", { "data-tooltip": null });
    const div2 = t.div("test", { data: { tooltip: null } });
    expect(div1.toString()).toBe(div2.toString());
  });

  it("tag builder dasherize names", () => {
    const t = tag() as any;
    expect(t.img_slider().toString()).toBe("<img-slider></img-slider>");
  });

  it("content tag with invalid html tag", () => {
    const invalidTags = ["12p", "", "image file", "div/", "my>element", "_header"];
    for (const tagName of invalidTags) {
      expect(() => contentTag(tagName)).toThrow();
    }
  });

  it("tag with invalid html tag", () => {
    const invalidTags = ["12p", "", "image file", "div/", "my>element", "_header"];
    for (const tagName of invalidTags) {
      expect(() => tag(tagName)).toThrow();
    }
  });

  it("tag builder do not modify html safe options", () => {
    const htmlSafeStr = htmlSafe('"');
    expect((tag("p", { value: htmlSafeStr }) as SafeBuffer).toString()).toBe(
      '<p value="&quot;" />',
    );
    expect(htmlSafeStr.toString()).toBe('"');
    expect(htmlSafeStr.htmlSafe).toBe(true);
  });

  it("tag options with array of numeric", () => {
    const str = (tag("input", { value: [123, 456] }) as SafeBuffer).toString();
    expect(str).toBe('<input value="123 456" />');
  });

  it("tag attributes nil", () => {
    const t = tag() as any;
    expect(t.attributes(null).toString()).toBe("");
  });

  it("tag attributes empty", () => {
    const t = tag() as any;
    expect(t.attributes({}).toString()).toBe("");
  });

  it("tag attributes escapes values", () => {
    const t = tag() as any;
    const result = t.attributes({ xss: '"><script>alert()</script>' }).toString();
    expect(result).toContain('xss="&quot;&gt;&lt;script&gt;alert()&lt;/script&gt;"');
  });

  it("tag attributes inlines html attributes", () => {
    const t = tag() as any;
    const result = t
      .attributes({
        value: null,
        name: "name",
        "aria-hidden": false,
        aria: { label: "label" },
        data: { input_value: "data" },
        required: true,
      })
      .toString();
    expect(result).toContain('name="name"');
    expect(result).toContain('aria-hidden="false"');
    expect(result).toContain('aria-label="label"');
    expect(result).toContain('data-input-value="data"');
    expect(result).toContain('required="required"');
    // value=nil should be excluded, but data-input-value is fine
    expect(result).not.toMatch(/(?<![- ])value="/);
    expect(result).not.toMatch(/^value="/);
    expect(result).not.toContain(' value="');
  });

  it("tag options", () => {
    const str = (tag("p", { class: "show", class2: "elsewhere" }) as SafeBuffer).toString();
    expect(str).toContain("show");
  });

  it("tag options with array of random objects", () => {
    class MyObj {
      toString() {
        return "hello";
      }
    }
    const str = (tag("input", { value: [new MyObj()] }) as SafeBuffer).toString();
    expect(str).toBe('<input value="hello" />');
  });

  it("tag builder with dangerous aria attribute name", () => {
    const t = tag() as any;
    const escapedDangerousChars = "_".repeat(COMMON_DANGEROUS_CHARS.length);
    expect(t["the-name"]({ aria: { [COMMON_DANGEROUS_CHARS]: "the value" } }).toString()).toBe(
      `<the-name aria-${escapedDangerousChars}="the value"></the-name>`,
    );

    expect(
      t["the-name"]({ aria: { [COMMON_DANGEROUS_CHARS]: "the value" }, escape: false }).toString(),
    ).toBe(`<the-name aria-${COMMON_DANGEROUS_CHARS}="the value"></the-name>`);
  });

  it("tag builder with dangerous data attribute name", () => {
    const t = tag() as any;
    const escapedDangerousChars = "_".repeat(COMMON_DANGEROUS_CHARS.length);
    expect(t["the-name"]({ data: { [COMMON_DANGEROUS_CHARS]: "the value" } }).toString()).toBe(
      `<the-name data-${escapedDangerousChars}="the value"></the-name>`,
    );

    expect(
      t["the-name"]({ data: { [COMMON_DANGEROUS_CHARS]: "the value" }, escape: false }).toString(),
    ).toBe(`<the-name data-${COMMON_DANGEROUS_CHARS}="the value"></the-name>`);
  });

  it("tag builder with dangerous unknown attribute name", () => {
    const t = tag() as any;
    const escapedDangerousChars = "_".repeat(COMMON_DANGEROUS_CHARS.length);
    expect(t["the-name"]({ [COMMON_DANGEROUS_CHARS]: "the value" }).toString()).toBe(
      `<the-name ${escapedDangerousChars}="the value"></the-name>`,
    );

    expect(t["the-name"]({ [COMMON_DANGEROUS_CHARS]: "the value", escape: false }).toString()).toBe(
      `<the-name ${COMMON_DANGEROUS_CHARS}="the value"></the-name>`,
    );
  });

  it("content tag with block and options outside out of erb", () => {
    expect(contentTag("a", "Create", { href: "create" }).toString()).toBe(
      contentTag("a", { href: "create" }, null, true, () => "Create").toString(),
    );
  });

  it("tag builder with block and options outside out of erb", () => {
    const t = tag() as any;
    expect(t.a("Create", { href: "create" }).toString()).toBe(
      t.a({ href: "create" }, () => "Create").toString(),
    );
  });

  it("content tag with block and non string outside out of erb", () => {
    expect(contentTag("p").toString()).toBe(
      contentTag("p", null, null, true, () => {
        for (let i = 0; i < 3; i++) {
          /* do_something */
        }
        return "";
      }).toString(),
    );
  });

  it("tag builder with block and non string outside out of erb", () => {
    const t = tag() as any;
    expect(t.p().toString()).toBe(
      t
        .p(() => {
          for (let i = 0; i < 3; i++) {
            /* do_something */
          }
          return "";
        })
        .toString(),
    );
  });

  it("content tag nested in content tag out of erb", () => {
    expect(contentTag("p", contentTag("b", "Hello")).toString()).toBe("<p><b>Hello</b></p>");
    const t = tag() as any;
    expect(t.p(t.b("Hello")).toString()).toBe("<p><b>Hello</b></p>");
  });

  it("respond to", () => {
    const t = tag() as any;
    expect("any_tag" in t).toBe(true);
  });
});
