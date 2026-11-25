import { Base } from "@blazetrails/activejob";
import { ActionMailbox } from "./action-mailbox.js";
import type { InboundEmail } from "./app/models/action-mailbox/inbound-email.js";

export class RoutingJob extends Base {
  static {
    this.queueAs(null, () => ActionMailbox.queues.routing);
  }

  async perform(inboundEmail: InboundEmail): Promise<void> {
    await inboundEmail.route();
  }
}

ActionMailbox.RoutingJob = RoutingJob;
