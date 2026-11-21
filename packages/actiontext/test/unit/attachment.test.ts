import { beforeEach, describe, expect, it } from "vitest";
import { createFileBlob, fixturesAll } from "../test-helper.js";
import { Attachment } from "../../lib/attachment.js";
import { ContentAttachment } from "../../lib/attachables/content-attachment.js";
import { Content } from "../../lib/content.js";
import { TrixAttachment } from "../../lib/trix-attachment.js";
import { MessagesController } from "../dummy/app/controllers/messages-controller.js";
import { Page } from "../dummy/app/models/page.js";
import { Person } from "../dummy/app/models/person.js";

type BlobAttachable = Awaited<ReturnType<typeof createFileBlob>> & {
  attachableSgid(): string;
  attachableContentType(): string;
  filename: { toString(): string };
  byteSize: number;
  toParam(): unknown;
  toTrixContentAttachmentPartialPath(): unknown;
  toRichTextAttributes(attributes?: Record<string, unknown>): Record<string, unknown>;
};

type AttachmentWithProxy = Attachment & Record<string, unknown>;

describe("ActionText::AttachmentTest", () => {
  fixturesAll();
  let _attachment: BlobAttachable | undefined;

  beforeEach(() => {
    _attachment = undefined;
  });

  async function attachmentFromHtml(html: string): Promise<Attachment> {
    return (await (await Content.new(html)).attachments())[0]!;
  }

  async function attachable(): Promise<BlobAttachable> {
    return (_attachment ??= (await createFileBlob({
      filename: "racecar.jpg",
      contentType: "image/jpeg",
    })) as BlobAttachable);
  }

  it("from_attachable", async () => {
    const attachment = Attachment.fromAttachable(await attachable(), { caption: "Captioned" })!;
    expect(attachment.attachable).toBe(await attachable());
    expect(attachment.caption).toBe("Captioned");
  });

  it("proxies missing methods to attachable", async () => {
    Object.defineProperty(await attachable(), "proxied", {
      value: () => "proxied",
      configurable: true,
    });
    const attachment = Attachment.fromAttachable(await attachable())! as AttachmentWithProxy;
    expect((attachment.proxied as () => string)()).toBe("proxied");
  });

  it("proxies #to_param to attachable", async () => {
    const attachment = Attachment.fromAttachable(await attachable())!;
    expect(attachment.toParam()).toBe((await attachable()).toParam());
  });

  it("converts to TrixAttachment", async () => {
    const attachable_ = await attachable();
    const attachment = await attachmentFromHtml(
      `<action-text-attachment sgid="${attachable_.attachableSgid()}" caption="Captioned"></action-text-attachment>`,
    );

    const trixAttachment = await attachment.toTrixAttachment();
    expect(trixAttachment).toBeInstanceOf(TrixAttachment);

    expect(trixAttachment.attributes["sgid"]).toBe(attachable_.attachableSgid());
    expect(trixAttachment.attributes["contentType"]).toBe(attachable_.attachableContentType());
    expect(trixAttachment.attributes["filename"]).toBe(attachable_.filename.toString());
    expect(trixAttachment.attributes["filesize"]).toBe(attachable_.byteSize);
    expect(trixAttachment.attributes["caption"]).toBe("Captioned");

    expect(attachable_.toTrixContentAttachmentPartialPath()).toBeNull();
    expect(trixAttachment.attributes["content"] ?? null).toBeNull();
  });

  it("converts to TrixAttachment with content", async () => {
    const attachable = (await Person.createBang({ name: "Javan" })) as unknown as BlobAttachable;
    const attachment = await attachmentFromHtml(
      `<action-text-attachment sgid="${attachable.attachableSgid()}"></action-text-attachment>`,
    );

    const trixAttachment = await attachment.toTrixAttachment();
    expect(trixAttachment).toBeInstanceOf(TrixAttachment);

    expect(trixAttachment.attributes["sgid"]).toBe(attachable.attachableSgid());
    expect(trixAttachment.attributes["contentType"]).toBe(attachable.attachableContentType());

    expect(attachable.toTrixContentAttachmentPartialPath()).not.toBeNull();
    expect(trixAttachment.attributes["content"] ?? null).not.toBeNull();
  });

  it("converts to plain text", async () => {
    expect(
      await Attachment.fromAttachable(await attachable(), {
        caption: "Vroom vroom",
      })!.toPlainText(),
    ).toBe("[Vroom vroom]");
    expect(await Attachment.fromAttachable(await attachable())!.toPlainText()).toBe(
      "[racecar.jpg]",
    );
  });

  it("converts HTML content attachment", async () => {
    const attachment = await attachmentFromHtml(
      '<action-text-attachment content-type="text/html" content="abc"></action-text-attachment>',
    );
    const attachable = attachment.attachable as ContentAttachment;

    expect(attachable).toBeInstanceOf(ContentAttachment);
    expect(attachable.contentType).toBe("text/html");
    expect(attachable.content).toBe("abc");

    const trixAttachment = await attachment.toTrixAttachment();
    expect(trixAttachment).toBeInstanceOf(TrixAttachment);
    expect(trixAttachment.attributes["contentType"]).toBe("text/html");
    expect(trixAttachment.attributes["content"]).toBe("abc");
  });

  it("renders content attachment", async () => {
    const html =
      '<action-text-attachment content-type="text/html" content="&lt;p&gt;abc&lt;/p&gt;"></action-text-attachment>';
    const attachment = await attachmentFromHtml(html);
    const attachable = attachment.attachable as ContentAttachment;

    await Content.withRenderer(MessagesController.renderer, async () => {
      expect(String(await attachable.toHtml()).trim()).toBe("<p>abc</p>");
    });
  });

  it("to_trix_html sanitizes action-text HTML content attachment", async () => {
    const attachment = await Content.new(
      '<action-text-attachment content-type="text/html" content="<img src=. onerror=\'alert(location)\' />"></action-text-attachment>',
    );

    expect(await attachment.toTrixHtml()).toBe(
      '<figure data-trix-attachment="{&quot;contentType&quot;:&quot;text/html&quot;,&quot;content&quot;:&quot;<img src=\\&quot;.\\&quot;>&quot;}"></figure>',
    );
  });

  it("defaults trix partial to model partial", async () => {
    const attachable = await Page.createBang({ title: "Homepage" });
    expect(attachable.toTrixContentAttachmentPartialPath()).toBe("pages/page");
  });
});
