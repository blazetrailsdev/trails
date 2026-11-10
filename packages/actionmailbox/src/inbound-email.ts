import "./constants.inbound-email.generated.js";
import {
  include,
  runLoadHooks,
  type Extended,
  type Included,
  type TimeWithZone,
} from "@blazetrails/activesupport";
import type { ClassMethods as AttachedClassMethods } from "@blazetrails/activestorage/attached/model";
import type { One } from "@blazetrails/activestorage/attached/one";
import type { Blob } from "@blazetrails/activestorage/blob";
import { Mail, type Message } from "@blazetrails/mail";
import { ActionMailbox } from "./action-mailbox.js";
import { Incineratable } from "./inbound-email/incineratable.js";
import { MessageId } from "./inbound-email/message-id.js";
import { Routable } from "./inbound-email/routable.js";
import { Record } from "./record.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface InboundEmail extends Included<typeof Routable>, Included<typeof Incineratable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InboundEmail extends Record {
  declare static MessageId: typeof MessageId;
  declare static Incineratable: typeof Incineratable;
  declare static Routable: typeof Routable;

  declare static createAndExtractMessageIdBang: (
    source: string,
    options?: { [k: string]: unknown },
  ) => Promise<InboundEmail | null>;

  declare rawEmail: One & Pick<Blob, "download">;
  declare status: string;
  declare updated_at: TimeWithZone;
  declare statusPreviouslyChanged: () => boolean;
  declare message_id: string;
  declare message_checksum: string;
  declare isPending: () => boolean;
  declare isDelivered: () => boolean;
  declare isFailed: () => boolean;
  declare isBounced: () => boolean;
  declare bouncedBang: () => Promise<unknown>;
  declare deliveredBang: () => Promise<unknown>;
  declare processingBang: () => Promise<unknown>;
  declare failedBang: () => Promise<unknown>;

  private _mail?: Message;
  private _source?: Uint8Array;

  static {
    (this as unknown as Extended<typeof AttachedClassMethods>).hasOneAttached("rawEmail", {
      service: ActionMailbox.storageService,
    });
    this.enum("status", ["pending", "processing", "delivered", "failed", "bounced"]);
  }

  async mail(): Promise<Message> {
    return (this._mail ??= Mail.fromSource(await this.source()));
  }

  async source(): Promise<Uint8Array> {
    if (this._source == null) {
      await this.rawEmail.load();
      await (
        await this.rawEmail.attachment
      )?.blob;
      this._source = await this.rawEmail.download();
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
InboundEmail.Incineratable = Incineratable;
InboundEmail.Routable = Routable;
include(InboundEmail, Routable);
include(InboundEmail, MessageId);
include(InboundEmail, Incineratable);
ActionMailbox.InboundEmail = InboundEmail;

runLoadHooks("action_mailbox_inbound_email", InboundEmail);
