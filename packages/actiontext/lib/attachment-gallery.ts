import { Model } from "@blazetrails/activemodel";
import type { Html5Node } from "@blazetrails/nokogiri";
import { rbInspect, rbModName, toS } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import type { Attachment } from "./attachment.js";
import { Fragment } from "./fragment.js";

const TAG_NAME = "div";

export class AttachmentGallery extends Model {
  static fragmentByCanonicalizingAttachmentGalleries(content: unknown): Promise<Fragment> {
    return this.fragmentByReplacingAttachmentGalleryNodes(
      content,
      (node) => `<${TAG_NAME}>${node.innerHtml()}</${TAG_NAME}>`,
    );
  }

  static async fragmentByReplacingAttachmentGalleryNodes(
    content: unknown,
    block: (node: Html5Node) => unknown,
  ): Promise<Fragment> {
    let nodes: Html5Node[] = [];
    const fragment = Fragment.wrap(content).update((source) => {
      nodes = this.findAttachmentGalleryNodes(source);
    });
    for (const node of nodes) {
      node.replace(toS(await block(node)));
    }
    return fragment;
  }

  static findAttachmentGalleryNodes(content: unknown): Html5Node[] {
    return Fragment.wrap(content)
      .findAll(this.selector())
      .toA()
      .filter((node) =>
        node.children.every((child) => {
          if (child.isText()) {
            return /^(\n| )*$/.test(child.text);
          } else {
            return child.isMatches(this.attachmentSelector());
          }
        }),
      );
  }

  static fromNode(node: Html5Node): AttachmentGallery {
    return new this(node);
  }

  static attachmentSelector(): string {
    return `${ActionText.Attachment!.tagName}[presentation=gallery]`;
  }

  static selector(): string {
    return `${TAG_NAME}:has(${this.attachmentSelector()} + ${this.attachmentSelector()})`;
  }

  readonly node: Html5Node;
  /** @internal */
  private _attachments?: Array<Attachment | null>;

  constructor(node: Html5Node) {
    super();
    this.node = node;
  }

  async attachments(): Promise<Array<Attachment | null>> {
    return (this._attachments ??= await Promise.all(
      this.node
        .css(AttachmentGallery.attachmentSelector())
        .toA()
        .map(async (node) => (await ActionText.Attachment!.fromNode(node)).withFullAttributes()),
    ));
  }

  async size(): Promise<number> {
    return (await this.attachments()).length;
  }

  async inspect(): Promise<string> {
    return `#<${rbModName(this.constructor)} size=${rbInspect(await this.size())}>`;
  }
}

ActionText.AttachmentGallery = AttachmentGallery;
