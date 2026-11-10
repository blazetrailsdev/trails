import "../../constants.incineratable-incineration.generated.js";
import type { TimeWithZone } from "@blazetrails/activesupport";
import { ActionMailbox } from "../../action-mailbox.js";
import type { InboundEmail } from "../../inbound-email.js";

export class Incineration {
  private inboundEmail: InboundEmail;

  constructor(inboundEmail: InboundEmail) {
    this.inboundEmail = inboundEmail;
  }

  async run(): Promise<unknown> {
    if (this.isDue() && this.isProcessed()) return await this.inboundEmail.destroyBang();
    return null;
  }

  /** @internal */
  private isDue(): boolean {
    return this.inboundEmail.updated_at.lessThan(
      (ActionMailbox.incinerateAfter.ago() as TimeWithZone).endOfDay(),
    );
  }

  /** @internal */
  private isProcessed(): boolean {
    return this.inboundEmail.isProcessed();
  }
}
