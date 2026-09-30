import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { I18n, type SafeBuffer } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { DetailsKey } from "../lookup-context.js";
import { TemplateHandlers } from "./handlers.js";
import { Tse } from "./handlers/tse.js";
import { Raw } from "./handlers/raw.js";
import { FixtureResolver } from "../testing/resolvers.js";
import type { Body } from "../renderer/streaming-template-renderer.js";
import type { ViewContext } from "../renderer/abstract-renderer.js";

const FIXTURES = {
  "layouts/yield.html.tse": '<title><%= _layoutFor("title") %></title>\n<%= yield %>\n',
  "layouts/yield_with_render_inline_inside.html.tse":
    "<%= render({ inline: 'welcome' }) %>\n<%= yield %>\n",
  "layouts/yield_with_render_partial_inside.html.tse":
    "<%= render({ partial: 'test/partial' }) %>\n<%= yield %>\n",
  "layouts/_column.html.tse":
    '<div id="column"><%= _layoutFor("column") %></div>\n<div id="content"><%= yield %></div>',
  "layouts/streaming.html.tse":
    '<%= _layoutFor("header") -%>\n<%= yield -%>\n<%= _layoutFor("footer") -%>\n' +
    '<%= _layoutFor("unknown").toString() || "." -%>',
  "layouts/streaming_with_capture.html.tse":
    '<%= _layoutFor("header") -%>\n<%= capture(() => { %>\n this works\n<%- }) -%>\n' +
    '<%= _layoutFor("footer") -%>\n<%= _layoutFor("unknown").toString() || "." -%>\n',
  "layouts/streaming_with_locale.html.tse": "layout.locale: <%= I18n.locale() %>\n<%= yield %>\n",
  "test/hello_world.html.tse": "Hello world!",
  "test/_partial_only.html.tse": "only partial",
  "test/_partial.html.tse": "partial html",
  "test/nested_layout.html.tse":
    '<%- contentFor("title", "title") -%>\n' +
    '<% contentFor("column", () => { %>column<% }) %>\n' +
    "<%= render({ layout: 'layouts/column' }, {}, () => { %>content<% }) %>",
  "test/layout_render_file.html.tse":
    '<% contentFor("title", () => { %>title<% }) %>\n' +
    "<%= render({ template: 'layouts/yield' }) -%>\n",
  "test/hello.html.raw": "<p>This is grand!</p>\n",
  "test/streaming.html.tse":
    '<% provide("header", null, () => { %>Yes, <% }) %>\nthis works\n' +
    '<%- contentFor("footer", " like a charm") -%>\n',
  "test/streaming_buster.html.tse":
    '<%= _layoutFor("foo") -%>\nThis won\'t look\n<%- provide("unknown", " good.") -%>\n',
  "test/nested_streaming.html.tse":
    '<% contentFor("header", () => { %>?<% }) %>\n' +
    '<%= render({ template: "test/streaming" }) %>\n?',
  "test/streaming_with_locale.html.tse": "view.locale: <%= I18n.locale() %>\n",
};

function setupFiberedBase() {
  const state = {} as { assigns: Record<string, unknown>; view: Base };

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    TemplateHandlers.registerTemplateHandler("raw", new Raw());
    DetailsKey.clear();

    const viewPaths = [new FixtureResolver(FIXTURES)];
    state.assigns = { secret: "in the sauce", name: null };
    state.view = Base.withEmptyTemplateCache().withViewPaths(viewPaths, state.assigns);
  });

  afterEach(() => TemplateHandlers.clear());

  const renderBody = (options: Record<string, unknown>) =>
    state.view.viewRenderer.renderBody(state.view as unknown as ViewContext, options);

  const bufferedRender = async (options: Record<string, unknown>): Promise<string> => {
    const body = await renderBody(options);
    let string = "";
    const each = (piece: string | SafeBuffer | null) => void (string += String(piece ?? ""));
    if (Array.isArray(body)) body.forEach(each);
    else await body.each(each);
    return string;
  };

  return { renderBody, bufferedRender };
}

describe("FiberedTest", () => {
  const { renderBody, bufferedRender } = setupFiberedBase();

  it("streaming works", async () => {
    const content: string[] = [];
    const body = (await renderBody({
      template: "test/hello_world",
      layout: "layouts/yield",
    })) as Body;

    await body.each((piece) => {
      content.push(piece);
    });

    expect(content[0]).toBe("<title>");
    expect(content[1]).toBe("");
    expect(content[2]).toBe("</title>\n");
    expect(content[3]).toBe("Hello world!");
    expect(content[4]).toBe("\n");
  });

  it("render file", async () => {
    expect(
      await bufferedRender({
        file: `${File.dirname(new URL(import.meta.url).pathname)}/fixtures/test/hello_world.text`,
      }),
    ).toBe("Hello world!");
  });

  it("render partial", async () => {
    expect(await bufferedRender({ partial: "test/partial_only" })).toBe("only partial");
  });

  it("render inline", async () => {
    expect(await bufferedRender({ inline: "Hello, World!" })).toBe("Hello, World!");
  });

  it("render without layout", async () => {
    expect(await bufferedRender({ template: "test/hello_world" })).toBe("Hello world!");
  });

  it("render with layout", async () => {
    expect(await bufferedRender({ template: "test/hello_world", layout: "layouts/yield" })).toBe(
      "<title></title>\nHello world!\n",
    );
  });

  it("render with layout which has render inline", async () => {
    expect(
      await bufferedRender({
        template: "test/hello_world",
        layout: "layouts/yield_with_render_inline_inside",
      }),
    ).toBe("welcome\nHello world!\n");
  });

  it("render with layout which renders another partial", async () => {
    expect(
      await bufferedRender({
        template: "test/hello_world",
        layout: "layouts/yield_with_render_partial_inside",
      }),
    ).toBe("partial html\nHello world!\n");
  });

  it("render with nested layout", async () => {
    expect(await bufferedRender({ template: "test/nested_layout", layout: "layouts/yield" })).toBe(
      '<title>title</title>\n\n<div id="column">column</div>\n<div id="content">content</div>\n',
    );
  });

  it("render with file in layout", async () => {
    expect(await bufferedRender({ template: "test/layout_render_file" })).toBe(
      "\n<title>title</title>\n\n",
    );
  });

  it("render with handler without streaming support", async () => {
    expect(await bufferedRender({ template: "test/hello" })).toMatch("<p>This is grand!</p>");
  });

  it("render with streaming multiple yields provide and content for", async () => {
    expect(await bufferedRender({ template: "test/streaming", layout: "layouts/streaming" })).toBe(
      "Yes, \nthis works\n like a charm.",
    );
  });

  it("render with streaming with fake yields and streaming buster", async () => {
    expect(
      await bufferedRender({ template: "test/streaming_buster", layout: "layouts/streaming" }),
    ).toBe("This won't look\n good.");
  });

  it("render with nested streaming multiple yields provide and content for", async () => {
    expect(
      await bufferedRender({ template: "test/nested_streaming", layout: "layouts/streaming" }),
    ).toBe("?Yes, \n\nthis works\n\n? like a charm.");
  });

  it("render with streaming and capture", async () => {
    expect(
      await bufferedRender({
        template: "test/streaming",
        layout: "layouts/streaming_with_capture",
      }),
    ).toBe("Yes, \n this works\n like a charm.");
  });
});

describe("FiberedWithLocaleTest", () => {
  let oldLocale: ReturnType<typeof I18n.locale>;

  let oldEnforceAvailableLocales: boolean;

  beforeEach(() => {
    oldEnforceAvailableLocales = I18n.enforceAvailableLocales();
    I18n.setEnforceAvailableLocales(false);
    oldLocale = I18n.locale();
    I18n.setLocale("da");
  });

  afterEach(() => {
    I18n.setLocale(oldLocale);
    I18n.setEnforceAvailableLocales(oldEnforceAvailableLocales);
  });

  const { bufferedRender } = setupFiberedBase();

  it("render with streaming and locale", async () => {
    expect(
      await bufferedRender({
        template: "test/streaming_with_locale",
        layout: "layouts/streaming_with_locale",
      }),
    ).toBe("layout.locale: da\nview.locale: da\n\n");
  });
});
