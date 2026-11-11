import {
  delegate,
  htmlSafe,
  include,
  isBlank,
  isPresent,
  presence,
  runLoadHooks,
  truncate,
  withDefaultsBang,
  type Included,
} from "@blazetrails/activesupport";
import type { Html5Node } from "@blazetrails/nokogiri";
import { rbInspect, rbModName } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { Attachable } from "./attachable.js";
import { Attachment } from "./attachment.js";
import { AttachmentGallery } from "./attachment-gallery.js";
import { Fragment } from "./fragment.js";
import { Rendering, type RenderingClassMethods } from "./rendering.js";

interface ContentOptions {
  canonicalize?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rendering` (content.rb:25); the class/interface merge is how `include()` surfaces on the type side.
export interface Content extends Included<typeof Rendering> {
  render(...args: unknown[]): unknown;
  sanitizeContentAttachment(contentAttachment: string): string;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Content {
  declare static renderer: RenderingClassMethods["renderer"];
  declare static actionControllerRenderer: RenderingClassMethods["actionControllerRenderer"];
  declare static withRenderer: RenderingClassMethods["withRenderer"];
  declare static render: RenderingClassMethods["render"];

  static {
    include(this, Rendering);
  }

  static async fragmentByCanonicalizingContent(content: unknown): Promise<Fragment> {
    let fragment = await Attachment.fragmentByCanonicalizingAttachments(content);
    fragment = await AttachmentGallery.fragmentByCanonicalizingAttachmentGalleries(fragment);
    return fragment;
  }

  declare fragment: Fragment;
  /** @noRailsEquivalent PERMANENT */
  readonly canonicalized: Promise<this>;
  /** @internal */
  private _links?: string[];
  /** @internal */
  private _attachments?: Array<Attachment | null>;
  /** @internal */
  private _attachmentGalleries?: AttachmentGallery[];
  /** @internal */
  private _galleryAttachments?: Array<Attachment | null>;
  /** @internal */
  private _attachables?: unknown[];
  /** @internal */
  private _attachmentNodes?: Html5Node[];
  /** @internal */
  private _attachmentGalleryNodes?: Html5Node[];

  constructor(content: unknown = null, options: ContentOptions = {}) {
    withDefaultsBang(options, { canonicalize: true });

    if (options.canonicalize) {
      this.canonicalized = (this.constructor as typeof Content)
        .fragmentByCanonicalizingContent(content)
        .then((fragment) => {
          this.fragment = fragment;
          return this;
        });
    } else {
      this.fragment = Fragment.wrap(content);
      this.canonicalized = Promise.resolve(this);
    }
  }

  links(): string[] {
    return (this._links ??= [
      ...new Set(
        this.fragment
          .findAll("a[href]")
          .toA()
          .map((a) => a.get("href")!),
      ),
    ]);
  }

  async attachments(): Promise<Array<Attachment | null>> {
    return (this._attachments ??= await Promise.all(
      this.attachmentNodes().map((node) => this.attachmentForNode(node)),
    ));
  }

  async attachmentGalleries(): Promise<AttachmentGallery[]> {
    return (this._attachmentGalleries ??= this.attachmentGalleryNodes().map((node) =>
      this.attachmentGalleryForNode(node),
    ));
  }

  async galleryAttachments(): Promise<Array<Attachment | null>> {
    if (this._galleryAttachments) return this._galleryAttachments;
    const galleries = await this.attachmentGalleries();
    return (this._galleryAttachments = (
      await Promise.all(galleries.map((gallery) => gallery.attachments()))
    ).flat());
  }

  async attachables(): Promise<unknown[]> {
    return (this._attachables ??= await Promise.all(
      this.attachmentNodes().map((node) => Attachable.fromNode(node)),
    ));
  }

  async appendAttachables(attachables: unknown): Promise<Content> {
    const attachments = Attachment.fromAttachables(attachables);
    return new (this.constructor as typeof Content)(
      [presence(await this.toString()), ...attachments].filter((x) => x != null).join("\n"),
    ).canonicalized;
  }

  async renderAttachments(
    options: { withFullAttributes?: boolean } = {},
    block: (attachment: Attachment | null) => unknown,
  ): Promise<Content> {
    const nodes: Html5Node[] = [];
    const content = this.fragment.replace(Attachment.tagName, (node) => {
      if (node.isKey("content")) {
        const sanitizedContent = this.sanitizeContentAttachment(
          String(node.removeAttribute("content")),
        );
        if (isPresent(sanitizedContent)) node.set("content", sanitizedContent);
      }
      nodes.push(node);
      return node;
    });
    for (const node of nodes) {
      const replacementNode = await block(await this.attachmentForNode(node, options));
      if (!node.equals(replacementNode)) node.replace(String(replacementNode));
    }
    return new (this.constructor as typeof Content)(content, { canonicalize: false });
  }

  async renderAttachmentGalleries(
    block: (attachmentGallery: AttachmentGallery) => unknown,
  ): Promise<Content> {
    const content = await AttachmentGallery.fragmentByReplacingAttachmentGalleryNodes(
      this.fragment,
      (node) => block(this.attachmentGalleryForNode(node)),
    );
    return new (this.constructor as typeof Content)(content, { canonicalize: false });
  }

  async toPlainText(): Promise<string> {
    return (
      await this.renderAttachments({ withFullAttributes: false }, (attachment) =>
        attachment!.toPlainText(),
      )
    ).fragment.toPlainText();
  }

  async toTrixHtml(): Promise<string> {
    return (
      await this.renderAttachments(undefined, (attachment) => attachment!.toTrixAttachment())
    ).toHtml();
  }

  toHtml(): string {
    return this.fragment.toHtml();
  }

  toRenderedHtmlWithLayout(): unknown {
    return this.render({
      layout: "action_text/contents/content",
      partial: this.toPartialPath(),
      formats: "html",
      locals: { content: this },
    });
  }

  toPartialPath(): string {
    return "action_text/contents/content";
  }

  toString(): unknown {
    return this.toRenderedHtmlWithLayout();
  }

  asJson(..._args: unknown[]): string {
    return this.toHtml();
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)} ${rbInspect(truncate(this.toHtml(), 25))}>`;
  }

  equals(other: unknown): boolean | Promise<boolean> | null {
    if (this.constructor === (other as object | null)?.constructor) {
      return this.toHtml() === (other as Content).toHtml();
    } else if (other instanceof this.constructor) {
      return Promise.all([this.toString(), (other as Content).toString()]).then(
        ([a, b]) => a === b,
      );
    }
    return null;
  }

  isBlank(): boolean {
    return isBlank(this.toHtml());
  }

  isEmpty(): boolean {
    return this.toHtml() === "";
  }

  htmlSafe(): ReturnType<typeof htmlSafe> {
    return htmlSafe(this.toHtml());
  }

  isPresent(): boolean {
    return isPresent(this.toHtml());
  }

  /** @internal */
  private attachmentNodes(): Html5Node[] {
    return (this._attachmentNodes ??= this.fragment.findAll(Attachment.tagName).toA());
  }

  /** @internal */
  private attachmentGalleryNodes(): Html5Node[] {
    return (this._attachmentGalleryNodes ??= AttachmentGallery.findAttachmentGalleryNodes(
      this.fragment,
    ));
  }

  /** @internal */
  private async attachmentForNode(
    node: Html5Node,
    { withFullAttributes = true }: { withFullAttributes?: boolean } = {},
  ): Promise<Attachment | null> {
    const attachment = await Attachment.fromNode(node);
    return withFullAttributes ? attachment.withFullAttributes() : attachment;
  }

  /** @internal */
  private attachmentGalleryForNode(node: Html5Node): AttachmentGallery {
    return AttachmentGallery.fromNode(node);
  }
}

delegate.call(Content.prototype, "deconstruct", { to: "fragment" });

ActionText.Content = Content;

runLoadHooks("action_text_content", Content);
