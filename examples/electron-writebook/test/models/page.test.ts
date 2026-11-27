import { describe, expect, it } from "vitest";
import { isHtmlSafe } from "@blazetrails/activesupport";
import "../test-helper.ts";
import { Page } from "../../app/models/page.ts";

describe("PageTest", () => {
  const build = async (body: string) => {
    const page = new Page();
    await page.setBody(body);
    return page;
  };

  it("html preview", async () => {
    const page = await build("# Hello\n\nWorld!");

    expect(await page.htmlPreview()).toMatch(/<h1>Hello<\/h1>/);
    expect(await page.htmlPreview()).toMatch(/<p>World!<\/p>/);
  });

  it("markable returns raw markdown content", async () => {
    const page = await build("## Markdown Content\n\nWith **bold** text.");
    expect(await page.markable()).toBe("## Markdown Content\n\nWith **bold** text.");
  });

  it("markable returns empty string when body is empty", async () => {
    const page = await build("");
    expect(await page.markable()).toBe("");
  });

  it("searchable_content re-encodes HTML entities decoded by to_plain_text", async () => {
    const page = await build("5 < 10 & 10 > 5");

    expect(String(await page.searchableContent())).toContain("5 &lt; 10 &amp; 10 &gt; 5");
    expect(isHtmlSafe(await page.searchableContent())).toBe(true);
  });
});
