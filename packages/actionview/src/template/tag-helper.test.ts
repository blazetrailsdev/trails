/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import type {} from "@blazetrails/vitest-matchers";
import {
  tag as _tag,
  contentTag as _contentTag,
  tokenList,
  classNames,
  cdataSection,
  escapeOnce,
  TagBuilder,
} from "../helpers/tag-helper.js";
import {
  ArgumentError,
  BigDecimal,
  CGI,
  publicInstanceMethods,
  rbObjMethod,
} from "@blazetrails/ruby-compat";
import { assertRespondTo, htmlSafe, SafeBuffer, withOptions } from "@blazetrails/activesupport";
import { FixtureResolver } from "../testing/resolvers.js";
import { raw } from "../helpers/output-safety-helper.js";
import { Base } from "../base.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

const view = new (Base.withEmptyTemplateCache())(null, {}, null);
const tag = _tag.bind(view);
const contentTag = _contentTag.bind(view);

const renderTse = async (string: string): Promise<string> => {
  const template = new Template(
    string.trim(),
    "test template",
    TemplateHandlers.handlerForExtension("tse")!,
    { format: ":html", locals: [] },
  );
  const view = Base.withEmptyTemplateCache();
  return String(await template.render(view.empty(), {})).trim();
};

const fixtureView = () =>
  Base.withEmptyTemplateCache().withViewPaths(
    [
      new FixtureResolver({
        "test/_content_tag_nested_in_content_tag.html.tse":
          "<%= contentTag('p', null, null, true, () => { %>\n  <%= contentTag('b', 'Hello') %>\n<% }) %>\n",
        "test/_builder_tag_nested_in_content_tag.html.tse":
          "<%= tag().p(() => { %>\n  <%= tag().b('Hello') %>\n<% }) %>\n",
        "test/_content_tag_nested_in_content_tag_with_data_attributes_out_of_erb.html.tse":
          "<%= contentTag('div', { data: { controller: 'read-more', 'read-more-more-text-value': 'Read more', 'read-more-less-text-value': 'Read less' } }, null, true, () => { %>\n" +
          "  <%= contentTag('p', 'Content text', { class: 'content-class', data: { 'test-name': 'content' } }) %>\n" +
          "  <%= contentTag('button', 'Read more', { class: 'expand-button', data: { action: 'read-more#toggle' } }) %>\n" +
          "<% }) %>\n",
      }),
    ],
    {},
  );

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

  it("tag builder defines methods to build html elements", () => {
    const t = tag() as any;
    assertRespondTo(t, "div");
    expect(publicInstanceMethods(t.constructor as typeof TagBuilder)).toContain("div");
  });

  it("tag builder renders unknown html elements", () => {
    expect(tag() as object).toRespondTo("turbo_frame");

    expect((tag() as any).turbo_frame("Rendered", { id: "rendered" }).toString()).toEqual(
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
    assertDomEqual(
      '<p disabled="disabled" itemscope="itemscope" multiple="multiple" readonly="readonly" allowfullscreen="allowfullscreen" seamless="seamless" typemustmatch="typemustmatch" sortable="sortable" default="default" inert="inert" truespeed="truespeed" allowpaymentrequest="allowpaymentrequest" nomodule="nomodule" playsinline="playsinline" />',
      String(
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
        }),
      ),
    );
  });

  it("tag builder options converts boolean option", () => {
    assertDomEqual(
      '<p disabled="disabled" itemscope="itemscope" multiple="multiple" readonly="readonly" allowfullscreen="allowfullscreen" seamless="seamless" typemustmatch="typemustmatch" sortable="sortable" default="default" inert="inert" truespeed="truespeed" allowpaymentrequest="allowpaymentrequest" nomodule="nomodule" playsinline="playsinline" />',
      String(
        (tag() as any).p({
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
        }),
      ),
    );
  });

  it("tag with dangerous name", () => {
    for (const char of INVALID_TAG_CHARS) {
      const tagName = `asdf-${char}`;
      expect(() => tag(tagName), `expected ${JSON.stringify(tagName)} to be invalid`).toThrow(
        ArgumentError,
      );
    }
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
    expect(contentTag("a", "Create", { href: "create" }).toString()).toEqual(
      '<a href="create">Create</a>',
    );
    expect(contentTag("a", "Create", { href: "create" }).htmlSafe).toBeTruthy();
    expect(contentTag("a", "Create", { href: "create" }).toString()).toEqual(
      contentTag("a", "Create", { href: "create" }).toString(),
    );
    expect(contentTag("p", "<script>evil_js</script>").toString()).toEqual(
      "<p>&lt;script&gt;evil_js&lt;/script&gt;</p>",
    );
    expect(contentTag("p", "<script>evil_js</script>", null, false).toString()).toEqual(
      "<p><script>evil_js</script></p>",
    );
    expect(contentTag("div", "test", { "@click": "triggerNav()" }).toString()).toEqual(
      '<div @click="triggerNav()">test</div>',
    );
  });

  it("tag builder with content", () => {
    const t = tag() as any;
    expect(t.div("Content", { id: "post_1" }).toString()).toEqual('<div id="post_1">Content</div>');
    expect(t.div("Content", { id: "post_1" }).htmlSafe).toBeTruthy();
    expect(t.div("Content", { id: "post_1" }).toString()).toEqual(
      t.div("Content", { id: "post_1" }).toString(),
    );
    expect(t.p("<script>evil_js</script>").toString()).toEqual(
      "<p>&lt;script&gt;evil_js&lt;/script&gt;</p>",
    );
    expect(t.p("<script>evil_js</script>", { escape: false }).toString()).toEqual(
      "<p><script>evil_js</script></p>",
    );
    expect(t.input({ pattern: /\w+/ }).toString()).toEqual('<input pattern="\\w+">');
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

  it("content tag with block in tse", async () => {
    const buffer = await renderTse(
      '<%= contentTag("div", null, null, true, () => { %>Hello world!<% }) %>',
    );
    assertDomEqual("<div>Hello world!</div>", buffer);
  });

  it("tag builder with block in tse", async () => {
    const buffer = await renderTse("<%= tag().div(() => { %>Hello world!<% }) %>");
    assertDomEqual("<div>Hello world!</div>", buffer);
  });

  it("content tag with block in tse containing non displayed tse", async () => {
    const buffer = await renderTse(
      '<%= contentTag("p", null, null, true, () => { %><% 1 %><% }) %>',
    );
    assertDomEqual("<p></p>", buffer);
  });

  it("tag builder with block in tse containing non displayed tse", async () => {
    const buffer = await renderTse("<%= tag().p(() => { %><% 1 %><% }) %>");
    assertDomEqual("<p></p>", buffer);
  });

  it("content tag with block and options in tse", async () => {
    const buffer = await renderTse(
      '<%= contentTag("div", { class: "green" }, null, true, () => { %>Hello world!<% }) %>',
    );
    assertDomEqual('<div class="green">Hello world!</div>', buffer);
  });

  it("tag builder with block and options in tse", async () => {
    const buffer = await renderTse(
      '<%= tag().div({ class: "green" }, () => { %>Hello world!<% }) %>',
    );
    assertDomEqual('<div class="green">Hello world!</div>', buffer);
  });

  it("content tag with block and options out of tse", () => {
    assertDomEqual(
      '<div class="green">Hello world!</div>',
      String(contentTag("div", { class: "green" }, null, true, () => "Hello world!")),
    );
  });

  it("tag builder with block and options out of tse", () => {
    assertDomEqual(
      '<div class="green">Hello world!</div>',
      String((tag() as any).div({ class: "green" }, () => "Hello world!")),
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
    let str = contentTag("p", "limelight", { class: ["song", "play>"] }, false);
    expect(str.toString()).toEqual('<p class="song play>">limelight</p>');

    str = contentTag("p", "limelight", { class: ["song", ["play>"]] }, false);
    expect(str.toString()).toEqual('<p class="song play>">limelight</p>');
  });

  it("tag builder with unescaped array class", () => {
    const t = tag() as any;
    let str = t.p("limelight", { class: ["song", "play>"], escape: false });
    expect(str.toString()).toEqual('<p class="song play>">limelight</p>');

    str = t.p("limelight", { class: ["song", ["play>"]], escape: false });
    expect(str.toString()).toEqual('<p class="song play>">limelight</p>');
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
    let str = contentTag("p", "limelight", { class: { song: true, play: false } });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", { class: [{ song: true }, { play: false }] });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", { class: { song: true, play: false } });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", { class: [{ song: true }, null, false] });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", { class: ["song", { foo: false }] });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = contentTag("p", "limelight", { class: [1, 2, 3] });
    expect(str.toString()).toEqual('<p class="1 2 3">limelight</p>');

    const klass = class {
      toString(): string {
        return "1";
      }
    };

    str = contentTag("p", "limelight", { class: [new klass()] });
    expect(str.toString()).toEqual('<p class="1">limelight</p>');

    str = contentTag("p", "limelight", { class: { song: true, play: true } });
    expect(str.toString()).toEqual('<p class="song play">limelight</p>');

    str = contentTag("p", "limelight", { class: { song: false, play: false } });
    expect(str.toString()).toEqual('<p class="">limelight</p>');
  });

  it("tag builder with conditional hash classes", () => {
    const t = tag() as any;
    let str = t.p("limelight", { class: { song: true, play: false } });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = t.p("limelight", { class: [{ song: true }, { play: false }] });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = t.p("limelight", { class: { song: true, play: false } });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = t.p("limelight", { class: [{ song: true }, null, false] });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = t.p("limelight", { class: ["song", { foo: false }] });
    expect(str.toString()).toEqual('<p class="song">limelight</p>');

    str = t.p("limelight", { class: { song: true, play: true } });
    expect(str.toString()).toEqual('<p class="song play">limelight</p>');

    str = t.p("limelight", { class: { song: false, play: false } });
    expect(str.toString()).toEqual('<p class="">limelight</p>');
  });

  it("content tag with unescaped conditional hash classes", () => {
    let str = contentTag("p", "limelight", { class: { song: true, "play>": true } }, false);
    expect(str.toString()).toEqual('<p class="song play>">limelight</p>');

    str = contentTag("p", "limelight", { class: ["song", { "play>": true }] }, false);
    expect(str.toString()).toEqual('<p class="song play>">limelight</p>');
  });

  it("tag builder with unescaped conditional hash classes", () => {
    const t = tag() as any;
    let str = t.p("limelight", { class: { song: true, "play>": true }, escape: false });
    expect(str.toString()).toEqual('<p class="song play>">limelight</p>');

    str = t.p("limelight", { class: ["song", { "play>": true }], escape: false });
    expect(str.toString()).toEqual('<p class="song play>">limelight</p>');
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
    expect(tokenList("a value").htmlSafe).toBeTruthy();
    expect(classNames("a value").htmlSafe).toBeTruthy();
  });

  it("token list and class names only html escape once", () => {
    for (const helperMethod of [tokenList, classNames]) {
      const helper = (...args: unknown[]) =>
        (helperMethod as (...a: unknown[]) => SafeBuffer)(...args);

      const tokens = [
        "click->controller#action1",
        "click->controller#action2",
        "click->controller#action3",
        "click->controller#action4",
      ];

      const tokenList = (tokens as unknown[]).reduce((memo, token) => helper(memo, token));

      expect((tokenList as SafeBuffer).htmlSafe).toBeTruthy();
      expect(CGI.unescapeHTML(String(tokenList)).split(/\s+/)).toEqual(tokens);
    }
  });

  it("content tag with data attributes", () => {
    assertDomEqual(
      '<p data-number="1" data-string="hello" data-string-with-quotes="double&quot;quote&quot;party&quot;">limelight</p>',
      String(
        contentTag("p", "limelight", {
          data: { number: 1, string: "hello", string_with_quotes: 'double"quote"party"' },
        }),
      ),
    );
  });

  it("tag builder with data attributes", () => {
    assertDomEqual(
      '<p data-number="1" data-string="hello" data-string-with-quotes="double&quot;quote&quot;party&quot;">limelight</p>',
      String(
        (tag() as any).p("limelight", {
          data: { number: 1, string: "hello", string_with_quotes: 'double"quote"party"' },
        }),
      ),
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
    expect(escapeOnce("1 < 2 &amp; 3").toString()).toEqual("1 &lt; 2 &amp; 3");
    expect(escapeOnce(" &#X27; &#x27; &#x03BB; &#X03bb; \" ' < > ").toString()).toEqual(
      " &#X27; &#x27; &#x03BB; &#X03bb; &quot; &#39; &lt; &gt; ",
    );
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
    assertDomEqual(
      '<p title="&quot;">content</p>',
      String(contentTag("p", "content", { title: htmlSafe('"') })),
    );
  });

  it("data tag does not honor html safe double quotes as attributes", () => {
    assertDomEqual(
      '<p data-title="&quot;">content</p>',
      String(contentTag("p", "content", { data: { title: htmlSafe('"') } })),
    );
  });

  it("skip invalid escaped attributes", () => {
    for (const escaped of ["&1;", "&#1dfa3;", "& #123;"]) {
      expect(String(tag("a", { href: escaped }))).toEqual(
        `<a href="${escaped.replace(/&/g, "&amp;")}" />`,
      );
      expect(String((tag() as any).a({ href: escaped }))).toEqual(
        `<a href="${escaped.replace(/&/g, "&amp;")}"></a>`,
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
    const data = {
      a_float: 3.14,
      a_big_decimal: new BigDecimal("-123.456"),
      a_number: 1,
      string: "hello",
      symbol: "foo",
      array: [1, 2, 3],
      hash: { key: "value" },
      string_with_quotes: 'double"quote"party"',
    };
    assertDomEqual(
      '<a data-a-float="3.14" data-a-big-decimal="-123.456" data-a-number="1" data-array="[1,2,3]" data-hash="{&quot;key&quot;:&quot;value&quot;}" data-string-with-quotes="double&quot;quote&quot;party&quot;" data-string="hello" data-symbol="foo" />',
      String(tag("a", { data })),
    );
    assertDomEqual(
      '<a data-a-float="3.14" data-a-big-decimal="-123.456" data-a-number="1" data-array="[1,2,3]" data-hash="{&quot;key&quot;:&quot;value&quot;}" data-string-with-quotes="double&quot;quote&quot;party&quot;" data-string="hello" data-symbol="foo" />',
      String((tag() as any).a({ data })),
    );
  });

  it("aria attributes", () => {
    const aria = {
      nil: null,
      a_float: 3.14,
      a_big_decimal: new BigDecimal("-123.456"),
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
    };
    assertDomEqual(
      '<a aria-a-float="3.14" aria-a-big-decimal="-123.456" aria-a-number="1" aria-truthy="true" aria-falsey="false" aria-array="1 2 3" aria-hash="a b" aria-tokens="a b" aria-string-with-quotes="double&quot;quote&quot;party&quot;" aria-string="hello" aria-symbol="foo" />',
      String(tag("a", { aria })),
    );

    assertDomEqual(
      '<a aria-a-float="3.14" aria-a-big-decimal="-123.456" aria-a-number="1" aria-truthy="true" aria-falsey="false" aria-array="1 2 3" aria-hash="a b" aria-tokens="a b" aria-string-with-quotes="double&quot;quote&quot;party&quot;" aria-string="hello" aria-symbol="foo" />',
      String((tag() as any).a({ aria })),
    );
  });

  it("link to data nil equal", () => {
    const divType1 = contentTag("div", "test", { "data-tooltip": null });
    const divType2 = contentTag("div", "test", { data: { tooltip: null } });
    assertDomEqual(String(divType1), String(divType2));
  });

  it("tag builder link to data nil equal", () => {
    const divType1 = (tag() as any).div("test", { "data-tooltip": null });
    const divType2 = (tag() as any).div("test", { data: { tooltip: null } });
    assertDomEqual(String(divType1), String(divType2));
  });

  it("tag builder allow call via method object", () => {
    expect(String(rbObjMethod(tag(), "foo").call())).toBe("<foo></foo>");
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
    expect(String(tag("p", { value: htmlSafeStr }))).toEqual('<p value="&quot;" />');
    expect(htmlSafeStr.toString()).toEqual('"');
    expect(htmlSafeStr.htmlSafe).toBeTruthy();
  });

  it("tag builder with options builds p elements", () => {
    const html = withOptions(tag() as TagBuilder, { id: "with-options" }, (t) =>
      (t as unknown as { p(content: string): unknown }).p("content"),
    );

    assertDomEqual('<p id="with-options">content</p>', html);
  });

  it("tag options with array of numeric", () => {
    const str = (tag("input", { value: [123, 456] }) as SafeBuffer).toString();
    expect(str).toBe('<input value="123 456" />');
  });

  it("tag attributes nil", async () => {
    expect(await renderTse('<input type="text" <%= tag().attributes(null) %>>')).toEqual(
      '<input type="text" >',
    );
  });

  it("tag attributes empty", async () => {
    expect(await renderTse('<input type="text" <%= tag().attributes({}) %>>')).toEqual(
      '<input type="text" >',
    );
  });

  it("tag attributes escapes values", async () => {
    const expectedOutput =
      '<input type="text" xss="&quot;&gt;&lt;script&gt;alert()&lt;/script&gt;">';

    expect(
      await renderTse(
        `<input type="text" <%= tag().attributes({ xss: '"><script>alert()</script>' }) %>>`,
      ),
    ).toEqual(expectedOutput);
  });

  it("tag attributes inlines html attributes", async () => {
    const expectedOutput =
      '<input type="text" name="name" aria-hidden="false" aria-label="label" data-input-value="data" required="required">';

    expect(
      await renderTse(
        '<input type="text" <%= tag().attributes({ value: null, name: "name", "aria-hidden": false, aria: { label: "label" }, data: { input_value: "data" }, required: true }) %>>',
      ),
    ).toEqual(expectedOutput);
  });

  it("tag options", () => {
    const str = String(tag("p", { class: "show", ":class": "elsewhere" }));
    expect(str).toMatch(/class="show"/);
    expect(str).toMatch(/class="elsewhere"/);
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

  it("content tag with block and options outside out of tse", () => {
    expect(contentTag("a", "Create", { href: "create" }).toString()).toBe(
      contentTag("a", { href: "create" }, null, true, () => "Create").toString(),
    );
  });

  it("tag builder with block and options outside out of tse", () => {
    const t = tag() as any;
    expect(t.a("Create", { href: "create" }).toString()).toBe(
      t.a({ href: "create" }, () => "Create").toString(),
    );
  });

  it("content tag with block and non string outside out of tse", () => {
    expect(contentTag("p").toString()).toBe(
      contentTag("p", null, null, true, () => {
        for (let i = 0; i < 3; i++) {
          /** @empty */
        }
        return "";
      }).toString(),
    );
  });

  it("tag builder with block and non string outside out of tse", () => {
    const t = tag() as any;
    expect(t.p().toString()).toBe(
      t
        .p(() => {
          for (let i = 0; i < 3; i++) {
            /** @empty */
          }
          return "";
        })
        .toString(),
    );
  });

  it("content tag nested in content tag out of tse", () => {
    expect(contentTag("p", contentTag("b", "Hello")).toString()).toBe("<p><b>Hello</b></p>");
    const t = tag() as any;
    expect(t.p(t.b("Hello")).toString()).toBe("<p><b>Hello</b></p>");
  });

  it("content tag nested in content tag in tse", async () => {
    expect(String(await fixtureView().render("test/content_tag_nested_in_content_tag"))).toBe(
      "<p>\n  <b>Hello</b>\n</p>",
    );
    expect(String(await fixtureView().render("test/builder_tag_nested_in_content_tag"))).toBe(
      "<p>\n  <b>Hello</b>\n</p>",
    );
  });

  it("content tag nested in content tag with data attributes out of tse", async () => {
    expect(
      String(
        await fixtureView().render(
          "test/content_tag_nested_in_content_tag_with_data_attributes_out_of_erb",
        ),
      ),
    ).toBe(
      '<div data-controller="read-more" data-read-more-more-text-value="Read more" data-read-more-less-text-value="Read less">\n  <p class="content-class" data-test-name="content">Content text</p>\n  <button class="expand-button" data-action="read-more#toggle">Read more</button>\n</div>',
    );
  });

  it("respond to", () => {
    expect(tag() as object).toRespondTo("any_tag");
  });
});
