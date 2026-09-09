import { describe, it, expect } from "vitest";

import { isHtmlSafe } from "@blazetrails/activesupport";

import { HTML } from "./html.js";

describe("Template::HTML", () => {
  it("escapes its string and marks the result html-safe", () => {
    const rendered = new HTML("<b>hi</b>", "html").render();
    expect(rendered.toString()).toBe("&lt;b&gt;hi&lt;/b&gt;");
    expect(isHtmlSafe(rendered)).toBe(true);
  });

  it("identifier and inspect both answer 'html template'", () => {
    const template = new HTML("", "html");
    expect(template.identifier()).toBe("html template");
    expect(template.inspect()).toBe("html template");
  });
});
