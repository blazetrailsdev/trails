import { isBlank } from "@blazetrails/activesupport";
import { Base64 } from "@blazetrails/ruby-compat";
import type { Message, Part } from "@blazetrails/mail";
import { ActionMailer } from "./namespaces.js";

export class InlinePreviewInterceptor {
  static readonly PATTERN = /src=(?:"cid:[^"]+"|'cid:[^']+')/gi;

  /** @internal */
  static previewingEmail(message: Message): Message {
    return new this(message).transformBang();
  }

  private _message: Message;
  private _htmlPart: Message | null | undefined;

  /** @internal */
  constructor(message: Message) {
    this._message = message;
  }

  /** @internal */
  transformBang(): Message {
    if (isBlank(this.htmlPart())) return this.message;

    this.htmlPart()!.setBody(
      (this.htmlPart()!.decoded() as string).replace(InlinePreviewInterceptor.PATTERN, (match) => {
        const part = this.findPart(match.slice(9, -1));
        if (part != null) {
          return `src="${this.dataUrl(part)}"`;
        } else {
          return match;
        }
      }),
    );

    return this.message;
  }

  /** @internal */
  private get message(): Message {
    return this._message;
  }

  /** @internal */
  private htmlPart(): Message | null {
    return (this._htmlPart ??= this.message.htmlPart() as Message | null);
  }

  /** @internal */
  private dataUrl(part: Part): string {
    return `data:${part.mimeType()};base64,${Base64.strictEncode64(part.body().rawSource)}`;
  }

  /** @internal */
  private findPart(cid: string): Part | undefined {
    return this.message.allParts().find((p) => p.isAttachment() && p.cid() === cid);
  }
}

ActionMailer.InlinePreviewInterceptor = InlinePreviewInterceptor;
