import { describe, expect, it } from "vitest";
import { Nokogiri } from "@blazetrails/nokogiri";
import "../test-helper.ts";
import { MarkdownRenderer } from "../../lib/markdown-renderer.ts";

describe("MarkdownRendererTest", () => {
  it("it generates unique IDs for headers", () => {
    const markdown = MarkdownRenderer.build();
    const content = markdown.render(
      "# Header 1\n\n## Duplicated Header\n\n### Duplicated header\n\n",
    );

    expect(content).toContain("id='duplicated-header'");
    expect(content).toContain("id='duplicated-header-2'");
  });

  it("it escapes image attributes", () => {
    const markdown = MarkdownRenderer.build();
    const content = markdown.render(`![a "b" &amp; c](/image.png?a=1&b=2 "x" data-x="y")`);

    expect(content).toContain(`title="x&quot; data-x=&quot;y"`);
    expect(content).toContain(`alt="a &quot;b&quot; &amp; c"`);
    expect(content).toContain(`href="/image.png?a=1&amp;b=2"`);
    expect(Nokogiri.HTML5.fragment(content).css("[data-x]")).toHaveLength(0);
  });
});
