import { describe, expect, it } from "vitest";
import { HTML4 } from "@blazetrails/html-sanitizer";
import { include } from "@blazetrails/activesupport";
import { Base, LookupContext, Template } from "@blazetrails/actionview";
import { TSE } from "@blazetrails/actionview/template/handlers/tse.js";
import { FixtureResolver } from "@blazetrails/actionview/testing/resolvers.js";
import { File } from "@blazetrails/ruby-compat";
import "./test-helper.js";
import "../../actionview/test/support/setup-compile-template.js";
import { Content } from "../lib/content.js";
import { ContentHelper } from "../lib/content-helper.js";

describe("ContentHelperTest", () => {
  it("sanitizer defaults to the HTML4 safe list sanitizer", () => {
    expect(ContentHelper.sanitizer).toBeInstanceOf(HTML4.SafeListSanitizer);
    expect(new ContentHelper().sanitizer).toBe(ContentHelper.sanitizer);
  });

  it("allows the attachment tag and attributes by default", () => {
    const helper = new ContentHelper();
    expect([...helper.sanitizerAllowedTags()]).toEqual(
      expect.arrayContaining(["action-text-attachment", "figure", "figcaption"]),
    );
    expect([...helper.sanitizerAllowedAttributes()]).toEqual(
      expect.arrayContaining(["sgid", "content-type", "presentation"]),
    );
  });

  it("sanitizes content attachments", () => {
    const helper = new ContentHelper();
    expect(helper.sanitizeContentAttachment("<figure>x<script>alert(1)</script></figure>")).toBe(
      "<figure>xalert(1)</figure>",
    );
  });
});

describe("ContentHelper rendering", () => {
  const VIEWS = [
    "action-text/attachables/_remote_image.html.tse",
    "action-text/attachment-galleries/_attachment_gallery.html.tse",
  ];

  const renderContent = async (html: string): Promise<string> => {
    Template.registerTemplateHandler("tse", new TSE());
    const files: Record<string, string> = {};
    for (const path of VIEWS) {
      files[path] = await File.read(File.expandPath(`../app/views/${path}`, import.meta.dirname));
    }
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([new FixtureResolver(files)]);
    const View = Base.withEmptyTemplateCache();
    include(View, ContentHelper);
    const view = new View(lookupContext, {}, null) as unknown as ContentHelper;
    return String(
      await (
        view as unknown as { renderActionTextContent(c: Content): Promise<unknown> }
      ).renderActionTextContent(await new Content(html).canonicalized),
    );
  };

  it("renders gallery and non-gallery attachments through their partials", async () => {
    const image = (n: number, presentation = "") =>
      `<action-text-attachment content-type="image" url="http://example.com/${n}.jpg" width="10" height="10"${presentation}></action-text-attachment>`;
    const html = await renderContent(
      `<div>${image(1)}<div>${image(2, ' presentation="gallery"')}${image(3, ' presentation="gallery"')}</div></div>`,
    );
    expect(html).toContain('<div class="attachment-gallery attachment-gallery--2">');
    expect(html.match(/attachment--preview/g)).toHaveLength(3);
    expect(html).toContain('src="http://example.com/1.jpg"');
    expect(html).toContain('src="http://example.com/3.jpg"');
  });
});
