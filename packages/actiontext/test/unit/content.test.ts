import { describe, expect, it } from "vitest";
import "../test-helper.js";
import { Attachment } from "../../lib/attachment.js";
import { Content } from "../../lib/content.js";
import { MissingAttachable } from "../../lib/attachables/missing-attachable.js";
import { RemoteImage } from "../../lib/attachables/remote-image.js";

async function contentFromHtml(html: string): Promise<Content> {
  return new Content(html).canonicalized;
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
  it("equality", async () => {
    const html = "<div>test</div>";
    const content = await contentFromHtml(html);
    expect(content.equals(await contentFromHtml(html))).toBe(true);
    expect(content.equals(html)).not.toBe(true);
  });

  it.skip("marshal serialization", () => {});

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

  it.skip("extracts attachables", () => {});

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

  it.skip("identifies destroyed attachables as missing", () => {});

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

  it.skip("renders with layout when ApplicationController is not defined", () => {});

  it.skip("does basic sanitization", () => {});

  it.skip("does custom tag sanitization", () => {});

  it.skip("sanitizes attachment markup for Trix", () => {});

  it.skip("removes content attribute if it's value is empty", () => {});

  it.skip("removes content attribute if it's value is empty after sanitization", () => {});

  it("does not add missing content attribute", async () => {
    const html = '<action-text-attachment sgid="123"></action-text-attachment>';
    const trixHtml = '<figure data-trix-attachment="{&quot;sgid&quot;:&quot;123&quot;}"></figure>';
    expect((await (await contentFromHtml(html)).toTrixHtml()).trim()).toBe(trixHtml);
  });

  it.skip("renders with layout when in a new thread", () => {});

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
