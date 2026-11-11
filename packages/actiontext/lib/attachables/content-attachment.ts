import { Model } from "@blazetrails/activemodel";
import type { Html5Node } from "@blazetrails/nokogiri";
import { ActionText } from "../action-text.js";

interface ContentInstance {
  fragment: { source: unknown };
  render(...args: unknown[]): unknown;
}

export class ContentAttachment extends Model {
  static async fromNode(node: Html5Node): Promise<ContentAttachment | null> {
    const attachment = new this({
      contentType: node.get("content-type"),
      content: node.get("content"),
    });
    if (await attachment.isValid()) return attachment;
    return null;
  }

  static {
    this.validatesFormatOf("contentType", { with: /html/ });
    this.validatesPresenceOf("content");
  }

  /** @internal */
  declare private _contentType: unknown;
  /** @internal */
  declare private _content: unknown;
  /** @internal */
  declare private _toHtml?: unknown;
  /** @internal */
  declare private _contentInstance?: ContentInstance;

  get contentType(): unknown {
    return this._contentType;
  }

  set contentType(value: unknown) {
    this._contentType = value;
  }

  get content(): unknown {
    return this._content;
  }

  set content(value: unknown) {
    this._content = value;
  }

  attachablePlainTextRepresentation(_caption: string | null): unknown {
    return this.contentInstance().fragment.source;
  }

  toHtml(): unknown {
    return (this._toHtml ??= this.contentInstance().render(this.contentInstance()));
  }

  toString(): string {
    return String(this.toHtml());
  }

  toPartialPath(): string {
    return "action_text/attachables/content_attachment";
  }

  /** @internal */
  private contentInstance(): ContentInstance {
    return (this._contentInstance ??= new (ActionText.Content as unknown as new (
      content: unknown,
    ) => ContentInstance)(this.content));
  }
}

ActionText.Attachables.ContentAttachment = ContentAttachment;
