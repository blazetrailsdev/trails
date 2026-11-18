import { Model } from "@blazetrails/activemodel";
import type { Html5Node } from "@blazetrails/nokogiri";
import { ActionText } from "../action-text.js";
import type { Content } from "../content.js";

export class ContentAttachment extends Model {
  static async fromNode(node: Html5Node): Promise<ContentAttachment | null> {
    const attachment = new this({
      contentType: node.get("content-type"),
      content: node.get("content"),
    });
    if (await attachment.isValid()) return attachment;
    return null;
  }

  /** @internal */
  declare private _contentType: unknown;
  /** @internal */
  declare private _content: unknown;
  /** @internal */
  declare private _toHtml?: unknown;
  /** @internal */
  declare private _contentInstance?: Content;

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

  static {
    this.validatesFormatOf("contentType", { with: /html/ });
    this.validatesPresenceOf("content");
  }

  async attachablePlainTextRepresentation(_caption: string | null): Promise<unknown> {
    return (await this.contentInstance()).fragment.source;
  }

  async toHtml(): Promise<unknown> {
    return (this._toHtml ??= await (
      await this.contentInstance()
    ).render(await this.contentInstance()));
  }

  toString(): Promise<unknown> {
    return this.toHtml();
  }

  toPartialPath(): string {
    return "action_text/attachables/content_attachment";
  }

  /** @internal */
  private async contentInstance(): Promise<Content> {
    return (this._contentInstance ??= await ActionText.Content!.new(this.content));
  }
}

ActionText.Attachables.ContentAttachment = ContentAttachment;
