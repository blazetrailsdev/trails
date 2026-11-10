import {
  dasherize,
  delegate,
  delegateMissingTo,
  include,
  mattrAccessor,
  presence,
  stringifyKeys,
  tryCall,
  underscore,
} from "@blazetrails/activesupport";
import type { Html5Node } from "@blazetrails/nokogiri";
import {
  filterMap,
  rbFArray,
  rbInspect,
  rbModName,
  rbObjRespondTo,
  slice,
  toS,
} from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { Caching } from "./attachments/caching.js";
import { Minification } from "./attachments/minification.js";
import { TrixConversion } from "./attachments/trix-conversion.js";
import type { Fragment } from "./fragment.js";
import { HtmlConversion } from "./html-conversion.js";

type Attachable = object & {
  toRichTextAttributes(attributes?: Record<string, unknown>): Record<string, unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (attachment.rb:20); the class/interface merge is how `include()` surfaces on the type side.
export interface Attachment {
  toParam(): unknown;
  cacheKey(...args: unknown[]): string;
  toTrixAttachment(content?: unknown): ReturnType<(typeof TrixConversion)["toTrixAttachment"]>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Attachment {
  declare static tagName: string;
  declare static fragmentByMinifyingAttachments: (content: unknown) => Fragment;
  declare static fragmentByConvertingTrixAttachments: (content: unknown) => Promise<Fragment>;
  declare static fromTrixAttachment: (trixAttachment: unknown) => Promise<Attachment | null>;

  static {
    include(this, TrixConversion);
    include(this, Minification);
    include(this, Caching);

    mattrAccessor.call(this, "tagName", { default: "action-text-attachment" });
  }

  static readonly ATTRIBUTES = [
    "sgid",
    "content-type",
    "url",
    "href",
    "filename",
    "filesize",
    "width",
    "height",
    "previewable",
    "presentation",
    "caption",
    "content",
  ];

  static async fragmentByCanonicalizingAttachments(content: unknown): Promise<Fragment> {
    return this.fragmentByMinifyingAttachments(
      await this.fragmentByConvertingTrixAttachments(content),
    );
  }

  static async fromNode(node: Html5Node, attachable: unknown = null): Promise<Attachment> {
    return new this(
      node,
      attachable != null && attachable !== false
        ? attachable
        : await ActionText.Attachable!.fromNode(node),
    );
  }

  static fromAttachables(attachables: unknown): Attachment[] {
    return filterMap(rbFArray(attachables), (attachable) =>
      this.fromAttachable(attachable as Attachable),
    );
  }

  static fromAttachable(
    attachable: Attachable,
    attributes: Record<string, unknown> = {},
  ): Attachment | null {
    const node = this.nodeFromAttributes(attachable.toRichTextAttributes(attributes));
    if (node != null) {
      return new this(node, attachable);
    }
    return null;
  }

  static async fromAttributes(
    attributes: Record<string, unknown>,
    attachable: unknown = null,
  ): Promise<Attachment | null> {
    const node = this.nodeFromAttributes(attributes);
    if (node != null) {
      return this.fromNode(node, attachable);
    }
    return null;
  }

  /** @internal */
  private static nodeFromAttributes(attributes: Record<string, unknown>): Html5Node | null {
    const processed = presence(this.processAttributes(attributes));
    if (processed != null) {
      return HtmlConversion.createElement(this.tagName, processed);
    }
    return null;
  }

  /** @internal */
  private static processAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
    return slice(
      Object.fromEntries(
        Object.entries(attributes).map(([key, value]) => [dasherize(underscore(toS(key))), value]),
      ),
      ...this.ATTRIBUTES,
    );
  }

  readonly node: Html5Node;
  readonly attachable: unknown;
  /** @internal */
  private _nodeAttributes?: Record<string, string>;
  /** @internal */
  private _attachableAttributes?: Record<string, unknown>;
  /** @internal */
  private _sgidAttributes?: Record<string, unknown>;

  constructor(node: Html5Node, attachable: unknown) {
    this.node = node;
    this.attachable = attachable;
  }

  get caption(): string | null {
    return presence(this.nodeAttributes()["caption"] ?? null);
  }

  fullAttributes(): Record<string, unknown> {
    return { ...this.nodeAttributes(), ...this.attachableAttributes(), ...this.sgidAttributes() };
  }

  withFullAttributes(): Promise<Attachment | null> {
    return (this.constructor as typeof Attachment).fromAttributes(
      this.fullAttributes(),
      this.attachable,
    );
  }

  toPlainText(): string {
    if (rbObjRespondTo(this, "attachablePlainTextRepresentation")) {
      return (
        this as unknown as { attachablePlainTextRepresentation(caption: string | null): string }
      ).attachablePlainTextRepresentation(this.caption);
    } else {
      return toS(this.caption);
    }
  }

  toHtml(): string {
    return HtmlConversion.nodeToHtml(this.node);
  }

  toString(): string {
    return this.toHtml();
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)} attachable=${rbInspect(this.attachable)}>`;
  }

  /** @internal */
  private nodeAttributes(): Record<string, string> {
    return (this._nodeAttributes ??= Object.fromEntries(
      Attachment.ATTRIBUTES.map((name) => [underscore(name), this.node.get(name)]).filter(
        ([, value]) => value != null,
      ),
    ) as Record<string, string>);
  }

  /** @internal */
  private attachableAttributes(): Record<string, unknown> {
    return (this._attachableAttributes ??= stringifyKeys(
      (tryCall(this.attachable as object, "toRichTextAttributes") as Record<string, unknown>) ?? {},
    ));
  }

  /** @internal */
  private sgidAttributes(): Record<string, unknown> {
    return (this._sgidAttributes ??=
      presence(slice(this.nodeAttributes(), "sgid")) ?? slice(this.attachableAttributes(), "sgid"));
  }
}

delegate.call(Attachment.prototype, "toParam", { to: "attachable" });
delegateMissingTo.call(Attachment, "attachable");

ActionText.Attachment = Attachment;
