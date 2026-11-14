import { describe, expect, it } from "vitest";
import { HTML5, XML } from "@blazetrails/nokogiri";
import { ActionText, Fragment, HtmlConversion } from "../lib/index.js";

describe("ActionText::Fragment", () => {
  it("wraps a fragment, a Nokogiri fragment and HTML", () => {
    const fragment = Fragment.wrap("<p>Hi</p>");
    expect(Fragment.wrap(fragment)).toBe(fragment);
    expect(Fragment.wrap(fragment.source).source).toBe(fragment.source);
    expect(fragment.source).toBeInstanceOf(XML.DocumentFragment);
    expect(fragment.toHtml()).toBe("<p>Hi</p>");
    expect(fragment.toString()).toBe("<p>Hi</p>");
  });

  it("replaces matching nodes on a copy", async () => {
    const fragment = Fragment.wrap("<p>a</p><div>b</div>");
    const replaced = await fragment.replace("p", () => "<span>x</span>");
    expect(replaced.toHtml()).toBe("<span>x</span><div>b</div>");
    expect(fragment.toHtml()).toBe("<p>a</p><div>b</div>");
    expect(replaced.findAll("span").length).toBe(1);
  });

  it("deconstructs to the source's elements", () => {
    const fragment = Fragment.wrap("text<p>a</p><div>b</div>");
    expect(fragment.deconstruct().map((node) => node.name)).toEqual(["p", "div"]);
  });

  it("builds HTML5 documents", () => {
    expect(ActionText.htmlDocumentClass()).toBe(HTML5.Document);
    expect(ActionText.htmlDocumentFragmentClass()).toBe(HTML5.DocumentFragment);
    expect(HtmlConversion.createElement("p", { class: "x" }).toHtml()).toBe('<p class="x"></p>');
  });
});
