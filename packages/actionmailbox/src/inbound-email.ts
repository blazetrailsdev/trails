import "./constants.inbound-email.generated.js";
import { include, runLoadHooks, type Extended, type Included } from "@blazetrails/activesupport";
import type { ClassMethods as AttachedClassMethods } from "@blazetrails/activestorage/attached/model";
import type { One } from "@blazetrails/activestorage/attached/one";
import { Mail, type Message } from "@blazetrails/mail";
import { ActionMailbox } from "./action-mailbox.js";
import { MessageId } from "./inbound-email/message-id.js";
import { Routable } from "./inbound-email/routable.js";
import { Record } from "./record.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface InboundEmail extends Included<typeof Routable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InboundEmail extends Record {
  declare static MessageId: typeof MessageId;
  declare static Routable: typeof Routable;

  declare static createAndExtractMessageIdBang: (
    source: string,
    options?: { [k: string]: unknown },
  ) => Promise<InboundEmail | null>;

  declare rawEmail: One;
  declare status: string;
  declare message_id: string;
  declare message_checksum: string;
  declare isPending: () => boolean;
  declare isDelivered: () => boolean;
  declare isFailed: () => boolean;
  declare isBounced: () => boolean;

  private _mail?: Message;
  private _source?: string;

  static {
    (this as unknown as Extended<typeof AttachedClassMethods>).hasOneAttached("rawEmail", {
      service: ActionMailbox.storageService,
    });
    this.enum("status", ["pending", "processing", "delivered", "failed", "bounced"]);
  }

  async mail(): Promise<Message> {
    return (this._mail ??= Mail.fromSource(await this.source()));
  }

  async source(): Promise<string> {
    if (this._source == null) {
      await this.rawEmail.load();
      this._source = new TextDecoder().decode(
        await (this.rawEmail as unknown as { download(): Promise<Uint8Array> }).download(),
      );
    }
    return this._source;
  }

  isProcessed(): boolean {
    return this.isDelivered() || this.isFailed() || this.isBounced();
  }

  /** @internal */
  instrumentationPayload(): { id: unknown; messageId: string; status: string } {
    return {
      id: this.id,
      messageId: this.message_id,
      status: this.status,
    };
  }
}

InboundEmail.MessageId = MessageId;
InboundEmail.Routable = Routable;
include(InboundEmail, MessageId);
include(InboundEmail, Routable);
ActionMailbox.InboundEmail = InboundEmail;

runLoadHooks("action_mailbox_inbound_email", InboundEmail);
