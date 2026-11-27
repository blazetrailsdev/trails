import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../test-helper.ts";
import { isolateEmbedProviders, setEmbedProviders } from "../embed-providers-env.ts";
import { ApplicationController } from "../../app/controllers/application-controller.ts";
import { EmbedProvider } from "../../app/models/embed-provider.ts";
import { HtmlScrubber } from "../../app/models/html-scrubber.ts";
import { Markdown } from "../../lib/trails-ext/action-text-markdown.ts";

describe("HtmlScrubberTest", () => {
  const scrub = (html: string) =>
    String(
      (
        ApplicationController.helpers() as unknown as Record<string, (...a: unknown[]) => unknown>
      ).sanitize(html, { scrubber: new HtmlScrubber() }),
    );
  const renderAndScrub = (markdown: string) => {
    const renderer = Markdown.renderer as unknown as { call(): { render(s: string): string } };
    return scrub(renderer.call().render(markdown));
  };

  beforeEach(resetDatabase);
  isolateEmbedProviders();

  it("cache_version changes when the embed policy does", async () => {
    const permissive = HtmlScrubber.cacheVersion();
    expect(permissive).toContain(EmbedProvider.cacheVersion());

    await setEmbedProviders(`[{"hosts":["x.example"],"path_prefix":"/e"}]`);
    expect(HtmlScrubber.cacheVersion()).not.toBe(permissive);
  });

  it("keeps an iframe from any origin while embeds are permissive, attributes still scrubbed", () => {
    const result = scrub(
      `<iframe src="http://anything.example/x" srcdoc="<script>alert(1)</script>" onload="alert(1)" sandbox="" allowfullscreen></iframe>`,
    );
    expect(result).toContain(`<iframe src="http://anything.example/x"`);
    expect(result).toContain("allowfullscreen");
    expect(result).not.toContain("srcdoc");
    expect(result).not.toContain("onload");
    expect(result).not.toContain("sandbox");
  });

  it("keeps only approved-provider iframes once an allowlist is configured", async () => {
    await setEmbedProviders(JSON.stringify(EmbedProvider.DEFAULTS));

    expect(scrub(`<iframe src="https://www.youtube.com/embed/abc"></iframe>`)).toContain("<iframe");
    expect(scrub(`<iframe src="https://anything.example/embed/abc"></iframe>`)).not.toContain(
      "<iframe",
    );
  });

  it("strips inline event handlers on allowed tags", () => {
    for (const tag of ["iframe", "img", "video", "audio", "details"]) {
      const result = scrub(`<${tag} onload="alert(1)" onerror="alert(1)"></${tag}>`);
      expect(result).not.toContain("onload");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("alert(1)");
    }
  });

  it("strips iframe srcdoc so framed markup cannot run script", () => {
    const result = scrub(`<iframe srcdoc="<script>alert(1)</script>"></iframe>`);
    expect(result).not.toContain("srcdoc");
    expect(result).not.toContain("alert(1)");
  });

  it("strips data-controller and data-turbo gadget attributes", () => {
    const result = scrub(
      `<div data-controller="edit-mode" data-turbo-method="delete" data-turbo-stream="x" data-foo="y">hi</div>`,
    );
    expect(result).not.toContain("data-controller");
    expect(result).not.toContain("data-turbo");
    expect(result).not.toContain("data-foo");
    expect(result).toContain("hi");
  });

  it("strips javascript: URL schemes from href and src", () => {
    expect(scrub(`<a href="javascript:alert(1)">x</a>`)).not.toContain("javascript");
    expect(scrub(`<iframe src="javascript:alert(1)"></iframe>`)).not.toContain("javascript");
  });

  it("scrubs javascript from style attributes to block CSS injection", () => {
    const result = scrub(`<p style="background:url(javascript:alert(1))">x</p>`);
    expect(result).not.toContain("javascript");
    expect(result).not.toContain("alert(1)");
  });

  it("preserves the Markdown renderer's lightbox image wiring", () => {
    const result = renderAndScrub("![cat](/uploads/cat.png)");
    expect(result).toContain(`data-action="lightbox#open:prevent"`);
    expect(result).toContain(`href="/uploads/cat.png"`);
    expect(result).toContain(`<img src="/uploads/cat.png" alt="cat">`);
  });

  it("allows the lightbox action only on anchors, not arbitrary data-action", () => {
    const kept = scrub(`<a data-action="lightbox#open:prevent" href="/x">ok</a>`);
    expect(kept).toContain(`data-action="lightbox#open:prevent"`);

    for (const action of [
      "turbo:load@window->lightbox#open",
      "load->arrangement#dragStartCreate",
      "mouseover->scroll-to-highlight#scroll",
    ]) {
      for (const tag of ["div", "a"]) {
        const result = scrub(`<${tag} data-action="${action}" href="/x">x</${tag}>`);
        expect(
          result,
          `expected ${JSON.stringify(action)} on <${tag}> to be stripped`,
        ).not.toContain("data-action");
      }
    }

    const details = scrub(
      `<details open data-action="lightbox#open:prevent"><summary>s</summary></details>`,
    );
    expect(details).not.toContain("data-action");
    const div = scrub(`<div data-action="lightbox#open:prevent">x</div>`);
    expect(div).not.toContain("data-action");
  });

  it("strips value-sensitive iframe attributes but keeps safe embed attributes", () => {
    const result = scrub(
      `<iframe src="https://player.vimeo.com/video/76979871" allow="camera" referrerpolicy="unsafe-url" sandbox="allow-scripts" allowfullscreen frameborder="0"></iframe>`,
    );
    expect(result).not.toContain("allow=");
    expect(result).not.toContain("referrerpolicy");
    expect(result).not.toContain("sandbox");
    expect(result).toContain("allowfullscreen");
    expect(result).toContain(`frameborder="0"`);
  });

  it("preserves the Markdown renderer's header anchor accessibility markup", () => {
    const result = renderAndScrub("# Introduction");
    expect(result).toContain(`id="introduction"`);
    expect(result).toContain(`aria-hidden="true"`);
  });

  it("preserves ARIA, role, and safe authored link attributes", () => {
    const result = scrub(
      `<a href="/x" target="_blank" rel="noopener" dir="rtl" tabindex="0" aria-label="open" role="button">y</a>`,
    );
    expect(result).toContain(`target="_blank"`);
    expect(result).toContain(`rel="noopener"`);
    expect(result).toContain(`dir="rtl"`);
    expect(result).toContain(`tabindex="0"`);
    expect(result).toContain(`aria-label="open"`);
    expect(result).toContain(`role="button"`);
  });

  it("preserves legitimate formatting, media, and table markup", () => {
    expect(scrub("<p>Hello <strong>world</strong> <em>now</em></p>")).toContain(
      "<strong>world</strong>",
    );
    expect(scrub(`<a href="https://example.com" title="t">link</a>`)).toContain(
      `href="https://example.com"`,
    );
    const video = scrub(`<video src="/uploads/v.mp4" controls></video>`);
    expect(video).toContain("<video");
    expect(video).toContain("controls");
    const table = scrub(
      "<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>",
    );
    expect(table).toContain("<th>H</th>");
    expect(table).toContain("<td>D</td>");
  });
});
