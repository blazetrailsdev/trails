import { describe, expect, it } from "vitest";
import "../test-helper.js";
import { Attachment } from "../../lib/attachment.js";
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
  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("equality", async () => {
    const html = "<div>test</div>";
    const content = await contentFromHtml(html);
    expect(content.equals(await contentFromHtml(html))).toBe(true);
    expect(content.equals(html)).not.toBe(true);
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("marshal serialization", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("roundtrips HTML without additional newlines", async () => {
    const html = "<div>a<br></div>";
    const content = await contentFromHtml(html);
    expect(content.toHtml()).toBe(html);
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("extracts links", async () => {
    const html = '<a href="http://example.com/1">1</a><br><a href="http://example.com/1">1</a>';
    const content = await contentFromHtml(html);
    expect(content.links()).toEqual(["http://example.com/1"]);
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("extracts attachables", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("extracts remote image attachables", async () => {
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

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("identifies destroyed attachables as missing", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("extracts missing attachables", async () => {
    const html = '<action-text-attachment sgid="missing"></action-text-attachment>';
    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(1);

    const attachable = (await content.attachments())[0]!.attachable as MissingAttachable;
    expect(attachable).toBeInstanceOf(MissingAttachable);
    expect(attachable.model() ?? null).toBeNull();
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("converts Trix-formatted attachments", async () => {
    const html = `<figure data-trix-attachment='{"sgid":"123","contentType":"text/plain","width":100,"height":100}' data-trix-attributes='{"caption":"Captioned"}'></figure>`;
    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(1);
    expect(content.toHtml()).toBe(
      '<action-text-attachment sgid="123" content-type="text/plain" width="100" height="100" caption="Captioned"></action-text-attachment>',
    );
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("converts Trix-formatted attachments with custom tag name", async () => {
    await withAttachmentTagName("arbitrary-tag", async () => {
      const html = `<figure data-trix-attachment='{"sgid":"123","contentType":"text/plain","width":100,"height":100}' data-trix-attributes='{"caption":"Captioned"}'></figure>`;
      const content = await contentFromHtml(html);
      expect((await content.attachments()).length).toBe(1);
      expect(content.toHtml()).toBe(
        '<arbitrary-tag sgid="123" content-type="text/plain" width="100" height="100" caption="Captioned"></arbitrary-tag>',
      );
    });
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("ignores Trix-formatted attachments with malformed JSON", async () => {
    const html = `<div data-trix-attachment='{"sgid":"garbage...'></div>`;
    const content = await contentFromHtml(html);
    expect((await content.attachments()).length).toBe(0);
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("minifies attachment markup", async () => {
    const html = '<action-text-attachment sgid="123"><div>HTML</div></action-text-attachment>';
    expect((await contentFromHtml(html)).toHtml()).toBe(
      '<action-text-attachment sgid="123"></action-text-attachment>',
    );
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("canonicalizes attachment gallery markup", async () => {
    const attachmentHtml =
      '<action-text-attachment sgid="1" presentation="gallery"></action-text-attachment><action-text-attachment sgid="2" presentation="gallery"></action-text-attachment>';
    const html = `<div class="attachment-gallery attachment-gallery--2">${attachmentHtml}</div>`;
    expect((await contentFromHtml(html)).toHtml()).toBe(`<div>${attachmentHtml}</div>`);
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("canonicalizes attachment gallery markup with whitespace", async () => {
    const attachmentHtml = `\n  <action-text-attachment sgid="1" presentation="gallery"></action-text-attachment>\n  <action-text-attachment sgid="2" presentation="gallery"></action-text-attachment>\n`;
    const html = `<div class="attachment-gallery attachment-gallery--2">${attachmentHtml}</div>`;
    expect((await contentFromHtml(html)).toHtml()).toBe(`<div>${attachmentHtml}</div>`);
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("canonicalizes nested attachment gallery markup", async () => {
    const attachmentHtml =
      '<action-text-attachment sgid="1" presentation="gallery"></action-text-attachment><action-text-attachment sgid="2" presentation="gallery"></action-text-attachment>';
    const html = `<blockquote><div class="attachment-gallery attachment-gallery--2">${attachmentHtml}</div></blockquote>`;
    expect((await contentFromHtml(html)).toHtml()).toBe(
      `<blockquote><div>${attachmentHtml}</div></blockquote>`,
    );
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("renders with layout when ApplicationController is not defined", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("does basic sanitization", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("does custom tag sanitization", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("sanitizes attachment markup for Trix", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("removes content attribute if it's value is empty", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("removes content attribute if it's value is empty after sanitization", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("does not add missing content attribute", async () => {
    const html = '<action-text-attachment sgid="123"></action-text-attachment>';
    const trixHtml = '<figure data-trix-attachment="{&quot;sgid&quot;:&quot;123&quot;}"></figure>';
    expect((await (await contentFromHtml(html)).toTrixHtml()).trim()).toBe(trixHtml);
  });

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("renders with layout when in a new thread", () => {});

  // BLOCKED: actiontext-content-test-remaining-arms
  it.skip("replace certain nodes", async () => {
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
