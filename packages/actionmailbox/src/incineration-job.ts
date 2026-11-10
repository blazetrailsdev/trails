import { Base } from "@blazetrails/activejob";
import { RecordNotFound } from "@blazetrails/activerecord";
import { ActionMailbox } from "./action-mailbox.js";
import type { InboundEmail } from "./inbound-email.js";

export class IncinerationJob extends Base {
  static {
    this.queueAs(null, () => ActionMailbox.queues.incineration);

    this.discardOn(RecordNotFound);
  }

  static async schedule(inboundEmail: InboundEmail): Promise<unknown> {
    return await this.set({ wait: ActionMailbox.incinerateAfter }).performLater(inboundEmail);
  }

  async perform(inboundEmail: InboundEmail): Promise<void> {
    await inboundEmail.incinerate();
  }
}

ActionMailbox.IncinerationJob = IncinerationJob;
