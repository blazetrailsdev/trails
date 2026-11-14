import { describe, expect, it } from "vitest";
import { Attachment } from "../lib/attachment.js";
import { AttachmentGallery } from "../lib/attachment-gallery.js";

class Racecar {
  toRichTextAttributes(attributes: Record<string, unknown> = {}) {
    return { ...attributes, sgid: "BAh7", contentType: "image/jpeg", filename: "racecar.jpg" };
  }
  toParam() {
    return "7";
  }
  proxied() {
    return "proxied";
  }
  attachablePlainTextRepresentation(caption: string | null) {
    return `[${caption ?? "racecar.jpg"}]`;
  }
}

describe("ActionText::Attachment", () => {
  it("builds from an attachable and reads its caption", () => {
    const attachable = new Racecar();
    const attachment = Attachment.fromAttachable(attachable, { caption: "Captioned" })!;
    expect(attachment.attachable).toBe(attachable);
    expect(attachment.caption).toBe("Captioned");
  });

  it("delegates toParam and missing methods to the attachable", () => {
    const attachment = Attachment.fromAttachable(new Racecar())!;
    expect(attachment.toParam()).toBe("7");
    expect((attachment as unknown as Racecar).proxied()).toBe("proxied");
    expect(attachment.toPlainText()).toBe("[racecar.jpg]");
  });

  it("converts to a TrixAttachment without content", async () => {
    const attachment = Attachment.fromAttachable(new Racecar(), { caption: "Captioned" })!;
    const trixAttachment = await attachment.toTrixAttachment();
    expect(trixAttachment.attributes["sgid"]).toBe("BAh7");
    expect(trixAttachment.attributes["contentType"]).toBe("image/jpeg");
    expect(trixAttachment.attributes["caption"]).toBe("Captioned");
  });

  it("minifies attachments and keys its cache on the node digest", async () => {
    const fragment = await Attachment.fragmentByMinifyingAttachments(
      `<${Attachment.tagName} sgid="1">inner</${Attachment.tagName}>`,
    );
    expect(fragment.toHtml()).toBe('<action-text-attachment sgid="1"></action-text-attachment>');
    const attachment = Attachment.fromAttachable(
      Object.assign(new Racecar(), { cacheKey: () => "racecars/7" }),
    )!;
    expect(attachment.cacheKey()).toMatch(/^ActionText::Attachment\/[0-9a-f]{64}\/racecars\/7$/);
  });
});

describe("ActionText::AttachmentGallery", () => {
  it("includes ActiveModel::Model", () => {
    expect(AttachmentGallery.modelName.element).toBe("attachment_gallery");
  });
});
