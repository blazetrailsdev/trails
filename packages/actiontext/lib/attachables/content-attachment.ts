import { Model } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import type { Html5Node } from "@blazetrails/nokogiri";
import { ActionText } from "../action-text.js";
import type { Content } from "../content.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include ActiveModel::Model` (content_attachment.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export interface ContentAttachment extends Model {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ContentAttachment {
  declare static validatesFormatOf: typeof Model.validatesFormatOf;
  declare static validatesPresenceOf: typeof Model.validatesPresenceOf;

  /** @inlinedFrom ActiveModel::API#initialize rails/v8.0.5.2/activemodel/lib/active_model/api.rb:80-84 */
  constructor(attributes: Record<string, unknown> | null = {}) {
    if (attributes != null) this.assignAttributes(attributes);
  }

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
    include(this, Model);
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
