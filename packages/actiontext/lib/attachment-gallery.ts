import { include } from "@blazetrails/activesupport";
import { Model } from "@blazetrails/activemodel";
import type { Html5Node } from "@blazetrails/nokogiri";
import { rbInspect, rbModName } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import type { Attachment } from "./attachment.js";
import { Fragment } from "./fragment.js";

const TAG_NAME = "div";

export class AttachmentGallery {
  static fragmentByCanonicalizingAttachmentGalleries(content: unknown): Fragment {
    return this.fragmentByReplacingAttachmentGalleryNodes(
      content,
      (node) => `<${TAG_NAME}>${node.innerHtml()}</${TAG_NAME}>`,
    );
  }

  static fragmentByReplacingAttachmentGalleryNodes(
    content: unknown,
    block: (node: Html5Node) => unknown,
  ): Fragment {
    return Fragment.wrap(content).update((source) => {
      for (const node of this.findAttachmentGalleryNodes(source)) {
        node.replace(String(block(node)));
      }
    });
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
  private _attachments?: Promise<Attachment[]>;

  constructor(node: Html5Node) {
    this.node = node;
  }

  attachments(): Promise<Attachment[]> {
    return (this._attachments ??= Promise.all(
      this.node
        .css(AttachmentGallery.attachmentSelector())
        .toA()
        .map(
          async (node) =>
            (await (await ActionText.Attachment!.fromNode(node)).withFullAttributes())!,
        ),
    ));
  }

  async size(): Promise<number> {
    return (await this.attachments()).length;
  }

  async inspect(): Promise<string> {
    return `#<${rbModName(this.constructor)} size=${rbInspect(await this.size())}>`;
  }
}

include(AttachmentGallery, Model);

ActionText.AttachmentGallery = AttachmentGallery;
