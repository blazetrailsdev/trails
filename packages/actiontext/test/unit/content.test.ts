import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { Marshal, Thread, regexpEscape } from "@blazetrails/ruby-compat";
import { createFileBlob, fixturesAll } from "../test-helper.js";
import { Attachment } from "../../lib/attachment.js";
import { ContentHelper } from "../../lib/content-helper.js";
import { Content } from "../../lib/content.js";
import { MissingAttachable } from "../../lib/attachables/missing-attachable.js";
import { RemoteImage } from "../../lib/attachables/remote-image.js";

async function contentFromHtml(html: string): Promise<Content> {
  const content = await new Content(html).canonicalized;
  await expect(Promise.resolve().then(() => content.toString())).resolves.not.toThrow();
  return content;
}

async function withAttachmentTagName(tagName: string, block: () => Promise<void>): Promise<void> {
  const previousTagName = Attachment.tagName;
  try {
    Attachment.tagName = tagName;
    await block();
  } finally {
    Attachment.tagName = previousTagName;
  }
}

describe("ActionText::ContentTest", () => {
  fixturesAll();

  it("equality", async () => {
    const html = "<div>test</div>";
    const content = await contentFromHtml(html);
    expect(content.equals(await contentFromHtml(html))).toBe(true);
    expect(content.equals(html)).not.toBe(true);
  });

  it("marshal serialization", async () => {
    const content = await contentFromHtml("Hello!");
    expect(content.equals(Marshal.load(Marshal.dump(content)))).toBe(true);
  });

  it("roundtrips HTML without additional newlines", async () => {
    const html = "<div>a<br></div>";
    const content = await contentFromHtml(html);
    expect(content.toHtml()).toBe(html);
  });

  it("extracts links", async () => {
    const html = '<a href="http://example.com/1">1</a><br><a href="http://example.com/1">1</a>';
    const content = await contentFromHtml(html);
    expect(content.links()).toEqual(["http://example.com/1"]);
  });

  it("extracts attachables", async () => {
    const attachable = (await createFileBlob({
      filename: "racecar.jpg",
      contentType: "image/jpeg",
    })) as Awaited<ReturnType<typeof createFileBlob>> & { attachableSgid(): string };
    const html = `<action-text-attachment sgid="${attachable.attachableSgid()}" caption="Captioned"></action-text-attachment>`;

    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(1);

    const attachment = (await content.attachments())[0]!;
    expect(attachment.caption).toBe("Captioned");
    expect(attachable.equals(attachment.attachable)).toBe(true);
  });

  it("extracts remote image attachables", async () => {
    const html =
      '<action-text-attachment content-type="image" url="http://example.com/cat.jpg" width="100" height="100" caption="Captioned"></action-text-attachment>';

    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(1);

    const attachment = (await content.attachments())[0]!;
    expect(attachment.caption).toBe("Captioned");

    const attachable = attachment.attachable as RemoteImage;
    expect(attachable).toBeInstanceOf(RemoteImage);
    expect(attachable.url).toBe("http://example.com/cat.jpg");
    expect(attachable.width).toBe("100");
    expect(attachable.height).toBe("100");
  });

  it("identifies destroyed attachables as missing", async () => {
    const file = (await createFileBlob({
      filename: "racecar.jpg",
      contentType: "image/jpeg",
    })) as Awaited<ReturnType<typeof createFileBlob>> & { attachableSgid(): string };
    const html = `<action-text-attachment sgid="${file.attachableSgid()}"></action-text-attachment>`;
    await file.destroyBang();
    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(1);

    const attachable = (await content.attachments())[0]!.attachable as MissingAttachable;
    expect(attachable).toBeInstanceOf(MissingAttachable);
    expect(attachable.model()).toBe(file.constructor);
    expect(attachable.toPartialPath()).toBe(MissingAttachable.DEFAULT_PARTIAL_PATH);
  });

  it("extracts missing attachables", async () => {
    const html = '<action-text-attachment sgid="missing"></action-text-attachment>';
    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(1);

    const attachable = (await content.attachments())[0]!.attachable as MissingAttachable;
    expect(attachable).toBeInstanceOf(MissingAttachable);
    expect(attachable.model() ?? null).toBeNull();
  });

  it("converts Trix-formatted attachments", async () => {
    const html = `<figure data-trix-attachment='{"sgid":"123","contentType":"text/plain","width":100,"height":100}' data-trix-attributes='{"caption":"Captioned"}'></figure>`;
    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(1);
    expect(content.toHtml()).toBe(
      '<action-text-attachment sgid="123" content-type="text/plain" width="100" height="100" caption="Captioned"></action-text-attachment>',
    );
  });

  it("converts Trix-formatted attachments with custom tag name", async () => {
    await withAttachmentTagName("arbitrary-tag", async () => {
      const html = `<figure data-trix-attachment='{"sgid":"123","contentType":"text/plain","width":100,"height":100}' data-trix-attributes='{"caption":"Captioned"}'></figure>`;
      const content = await contentFromHtml(html);
      expect((await content.attachments()).length).toBe(1);
      expect(content.toHtml()).toBe(
        '<arbitrary-tag sgid="123" content-type="text/plain" width="100" height="100" caption="Captioned"></arbitrary-tag>',
      );
    });
  });

  it("ignores Trix-formatted attachments with malformed JSON", async () => {
    const html = `<div data-trix-attachment='{"sgid":"garbage...'></div>`;
    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(0);
  });

  it("minifies attachment markup", async () => {
    const html = '<action-text-attachment sgid="123"><div>HTML</div></action-text-attachment>';
    expect((await contentFromHtml(html)).toHtml()).toBe(
      '<action-text-attachment sgid="123"></action-text-attachment>',
    );
  });

  it("canonicalizes attachment gallery markup", async () => {
    const attachmentHtml =
      '<action-text-attachment sgid="1" presentation="gallery"></action-text-attachment><action-text-attachment sgid="2" presentation="gallery"></action-text-attachment>';
    const html = `<div class="attachment-gallery attachment-gallery--2">${attachmentHtml}</div>`;
    expect((await contentFromHtml(html)).toHtml()).toBe(`<div>${attachmentHtml}</div>`);
  });

  it("canonicalizes attachment gallery markup with whitespace", async () => {
    const attachmentHtml = `\n  <action-text-attachment sgid="1" presentation="gallery"></action-text-attachment>\n  <action-text-attachment sgid="2" presentation="gallery"></action-text-attachment>\n`;
    const html = `<div class="attachment-gallery attachment-gallery--2">${attachmentHtml}</div>`;
    expect((await contentFromHtml(html)).toHtml()).toBe(`<div>${attachmentHtml}</div>`);
  });

  it("canonicalizes nested attachment gallery markup", async () => {
    const attachmentHtml =
      '<action-text-attachment sgid="1" presentation="gallery"></action-text-attachment><action-text-attachment sgid="2" presentation="gallery"></action-text-attachment>';
    const html = `<blockquote><div class="attachment-gallery attachment-gallery--2">${attachmentHtml}</div></blockquote>`;
    expect((await contentFromHtml(html)).toHtml()).toBe(
      `<blockquote><div>${attachmentHtml}</div></blockquote>`,
    );
  });

  it("renders with layout when ApplicationController is not defined", async () => {
    const html = "<h1>Hello world</h1>";
    const rendered = String(await (await contentFromHtml(html)).toRenderedHtmlWithLayout());

    expect(rendered).toContain(html);
    expect(rendered).toMatch(new RegExp(`^${regexpEscape('<div class="trix-content">')}`));
    expect("ApplicationController" in TopLevel).toBe(false);
  });

  it("does basic sanitization", async () => {
    const html = "<div onclick='action()'>safe<script>unsafe</script></div>";
    const rendered = String(await (await contentFromHtml(html)).toRenderedHtmlWithLayout());

    expect(rendered).not.toContain("<script>");
    expect(rendered).not.toContain("action");
  });

  it("does custom tag sanitization", async () => {
    const oldTags = ContentHelper.allowedTags;
    const oldAttrs = ContentHelper.allowedAttributes;
    try {
      ContentHelper.allowedTags = ["div"];
      ContentHelper.allowedAttributes = ["size"];

      const html = "<div size='large' class='high'>safe<span>unsafe</span></div>";
      const rendered = String(await (await contentFromHtml(html)).toRenderedHtmlWithLayout());

      expect(rendered).toContain("<div");
      expect(rendered).not.toContain("<span");
      expect(rendered).toContain("large");
      expect(rendered).not.toContain("high");
    } finally {
      ContentHelper.allowedTags = oldTags;
      ContentHelper.allowedAttributes = oldAttrs;
    }
  });

  // BLOCKED: html4-sanitizer-uri-escapes-attributes-like-libxml2
  it.skip("sanitizes attachment markup for Trix", async () => {
    const html =
      '<action-text-attachment content="<img src=\\&quot;.\\&quot; onerror=alert>"></action-text-attachment>';
    const trixHtml =
      '<figure data-trix-attachment="{&quot;content&quot;:&quot;<img src=\\&quot;\\\\%22.\\\\%22\\&quot;>&quot;}"></figure>';
    expect((await (await contentFromHtml(html)).toTrixHtml()).trim()).toBe(trixHtml);
  });

  it("removes content attribute if it's value is empty", async () => {
    const html = '<action-text-attachment sgid="123" content=""></action-text-attachment>';
    const trixHtml = '<figure data-trix-attachment="{&quot;sgid&quot;:&quot;123&quot;}"></figure>';
    expect((await (await contentFromHtml(html)).toTrixHtml()).trim()).toBe(trixHtml);
  });

  it("removes content attribute if it's value is empty after sanitization", async () => {
    const html =
      '<action-text-attachment sgid="123" content="<script></script>"></action-text-attachment>';
    const trixHtml = '<figure data-trix-attachment="{&quot;sgid&quot;:&quot;123&quot;}"></figure>';
    expect((await (await contentFromHtml(html)).toTrixHtml()).trim()).toBe(trixHtml);
  });

  it("does not add missing content attribute", async () => {
    const html = '<action-text-attachment sgid="123"></action-text-attachment>';
    const trixHtml = '<figure data-trix-attachment="{&quot;sgid&quot;:&quot;123&quot;}"></figure>';
    expect((await (await contentFromHtml(html)).toTrixHtml()).trim()).toBe(trixHtml);
  });

  it("renders with layout when in a new thread", async () => {
    const html = "<h1>Hello world</h1>";
    let rendered: unknown = null;
    await new Thread(async () => {
      rendered = await (await contentFromHtml(html)).toRenderedHtmlWithLayout();
    }).join();

    expect(String(rendered)).toContain(html);
    expect(String(rendered)).toMatch(new RegExp(`^${regexpEscape('<div class="trix-content">')}`));
  });

  it("replace certain nodes", async () => {
    const html = `<div>
  <p>replace me</p>
  <p>ignore me</p>
</div>
`;

    const expectedHtml = `<div>
  <p>replaced</p>
  <p>ignore me</p>
</div>
`;

    const content = await contentFromHtml(html);
    const replacedFragment = content.fragment.replace("p", (node) => {
      if (/replace me/.test(node.text)) {
        return "<p>replaced</p>";
      } else {
        return node;
      }
    });

    expect(replacedFragment.toHtml()).toBe(expectedHtml.trim());
  });

  // PERMANENT-SKIP: CLAUDE.md, "Ruby pattern matching has no port (`assert_pattern`, `deconstruct_keys`)" — every assertion is `content => [h1, div]` or an `assert_pattern` / `refute_pattern`.
  it.skip("delegates pattern matching to Nokogiri", () => {});
});
