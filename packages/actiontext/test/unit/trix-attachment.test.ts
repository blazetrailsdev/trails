import { describe, expect, it } from "vitest";
import { TrixAttachment } from "../../lib/trix-attachment.js";

function assertAttachmentAttribute(attachment: TrixAttachment, name: string, value: unknown): void {
  if (value == null) {
    expect(attachment.attributes[name]).toBeNull();
  } else {
    expect(attachment.attributes[name]).toEqual(value);
  }
}

function assertAttachmentAttributes(
  attachment: TrixAttachment,
  attributes: Record<string, unknown>,
): void {
  expect(attachment.attributes).toEqual(attributes);
}

function assertAttachmentJsonAttributes(
  attachment: TrixAttachment,
  attributes: Record<string, unknown>,
): void {
  for (const [name, expected] of Object.entries(attributes)) {
    const actual = JSON.parse(attachment.node.get(name)!);
    expect(actual).toEqual(expected);
  }
}

function attachment(attributes: Record<string, unknown>): TrixAttachment {
  return TrixAttachment.fromAttributes(attributes);
}

describe("ActionText::TrixAttachmentTest", () => {
  it("from_attributes", () => {
    const attributes = {
      "data-trix-attachment": {
        sgid: "123",
        contentType: "text/plain",
        href: "http://example.com/",
        filename: "example.txt",
        filesize: 12345,
        previewable: true,
      },
      "data-trix-attributes": {
        caption: "hello",
      },
    };

    const trixAttachment = attachment({
      sgid: "123",
      content_type: "text/plain",
      href: "http://example.com/",
      filename: "example.txt",
      filesize: "12345",
      previewable: "true",
      caption: "hello",
    });

    assertAttachmentJsonAttributes(trixAttachment, attributes);
  });

  it("previewable is typecast", () => {
    assertAttachmentAttribute(attachment({ previewable: "" }), "previewable", false);
    assertAttachmentAttribute(attachment({ previewable: false }), "previewable", false);
    assertAttachmentAttribute(attachment({ previewable: "false" }), "previewable", false);
    assertAttachmentAttribute(attachment({ previewable: "garbage" }), "previewable", false);
    assertAttachmentAttribute(attachment({ previewable: true }), "previewable", true);
    assertAttachmentAttribute(attachment({ previewable: "true" }), "previewable", true);
  });

  it("filesize is typecast when integer-like", () => {
    assertAttachmentAttribute(attachment({ filesize: 123 }), "filesize", 123);
    assertAttachmentAttribute(attachment({ filesize: "123" }), "filesize", 123);
    assertAttachmentAttribute(attachment({ filesize: "3.5 MB" }), "filesize", "3.5 MB");
    assertAttachmentAttribute(attachment({ filesize: null }), "filesize", null);
    assertAttachmentAttribute(attachment({ filesize: "" }), "filesize", "");
  });

  it("#attributes strips unmappable attributes", () => {
    const attributes = {
      sgid: "123",
      caption: "hello",
    };

    const trixAttachment = attachment({ sgid: "123", caption: "hello", nonexistent: "garbage" });
    assertAttachmentAttributes(trixAttachment, attributes);
  });
});
