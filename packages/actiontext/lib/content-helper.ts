import { htmlSafe, mattrAccessor, type SafeBuffer } from "@blazetrails/activesupport";
import { HTML4, type SanitizeOptions, type Sanitizer } from "@blazetrails/html-sanitizer";
import { chomp, classModule, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Attachment } from "./attachment.js";
import type { AttachmentGallery } from "./attachment-gallery.js";
import type { Content } from "./content.js";

type SanitizerClass = { allowedTags: Set<string>; allowedAttributes: Set<string> };

type RenderOptions = Record<string, unknown>;

type ViewHost = ContentHelper & {
  prefixPartialPathWithControllerNamespace: boolean;
  render(options: RenderOptions, block?: () => unknown): unknown;
};

export class ContentHelper {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  declare static sanitizer: Sanitizer;
  declare static allowedTags: Iterable<string> | null;
  declare static allowedAttributes: Iterable<string> | null;
  declare static scrubber: unknown;

  static {
    mattrAccessor.call(this, "sanitizer", { default: new HTML4.SafeListSanitizer() });
    mattrAccessor.call(this, "allowedTags");
    mattrAccessor.call(this, "allowedAttributes");
    mattrAccessor.call(this, "scrubber");
  }

  declare sanitizer: Sanitizer;
  declare allowedTags: Iterable<string> | null;
  declare allowedAttributes: Iterable<string> | null;
  declare scrubber: unknown;

  async renderActionTextContent(this: ViewHost, content: Content): Promise<SafeBuffer> {
    this.prefixPartialPathWithControllerNamespace = false;
    return this.sanitizeActionTextContent(await this.renderActionTextAttachments(content));
  }

  sanitizeContentAttachment(contentAttachment: string): string | null | undefined {
    return this.sanitizer.sanitize(contentAttachment, {
      tags: this.sanitizerAllowedTags(),
      attributes: this.sanitizerAllowedAttributes(),
      scrubber: this.scrubber,
    } as SanitizeOptions);
  }

  sanitizeActionTextContent(content: Content): SafeBuffer {
    return htmlSafe(
      this.sanitizer.sanitize(content.toHtml(), {
        tags: this.sanitizerAllowedTags(),
        attributes: this.sanitizerAllowedAttributes(),
        scrubber: this.scrubber,
      } as SanitizeOptions)!,
    );
  }

  async renderActionTextAttachments(this: ViewHost, content: Content): Promise<Content> {
    return (
      await content.renderAttachments(undefined, async (attachment) => {
        if (!(await content.galleryAttachments()).includes(attachment)) {
          const node = attachment!.node;
          node.setInnerHtml(
            await this.renderActionTextAttachment(attachment!, { locals: { inGallery: false } }),
          );
          return node;
        }
        return null;
      })
    ).renderAttachmentGalleries(async (attachmentGallery: AttachmentGallery) => {
      const attachments = await attachmentGallery.attachments();
      const html: string[] = [];
      for (const attachment of attachments) {
        attachment!.node.setInnerHtml(
          await this.renderActionTextAttachment(attachment!, { locals: { inGallery: true } }),
        );
        html.push(attachment!.toHtml());
      }
      return chomp(
        String(
          await this.render({ layout: attachmentGallery, object: attachmentGallery }, () =>
            htmlSafe(html.join("")),
          ),
        ),
      );
    });
  }

  /** @internal */
  async renderActionTextAttachment(
    this: ViewHost,
    attachment: Attachment,
    { locals = {} }: { locals?: Record<string, unknown> } = {},
  ): Promise<string> {
    const options: RenderOptions = { locals: locals, object: attachment, partial: attachment };

    if (rbObjRespondTo(attachment, "toAttachablePartialPath")) {
      options.partial = (
        attachment as unknown as { toAttachablePartialPath(): string }
      ).toAttachablePartialPath();
    }

    if (rbObjRespondTo(attachment, "modelName")) {
      options.as = (attachment as unknown as { modelName: { element: string } }).modelName.element;
    }

    return chomp(String(await this.render(options)));
  }

  sanitizerAllowedTags(): Iterable<string> {
    return (
      this.allowedTags ??
      new Set([
        ...(this.sanitizer.constructor as unknown as SanitizerClass).allowedTags,
        Attachment.tagName,
        "figure",
        "figcaption",
      ])
    );
  }

  sanitizerAllowedAttributes(): Iterable<string> {
    return (
      this.allowedAttributes ??
      new Set([
        ...(this.sanitizer.constructor as unknown as SanitizerClass).allowedAttributes,
        ...Attachment.ATTRIBUTES,
      ])
    );
  }
}
