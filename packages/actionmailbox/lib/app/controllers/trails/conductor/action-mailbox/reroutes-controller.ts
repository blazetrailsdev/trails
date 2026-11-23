import { ActionMailbox } from "../../../../../action-mailbox.js";
import type { InboundEmail } from "../../../../../inbound-email.js";
import { BaseController } from "../base-controller.js";

export class ReroutesController extends BaseController {
  async create(): Promise<void> {
    const inboundEmail = await ActionMailbox.InboundEmail.find(this.params.get("inbound_email_id"));
    await this.reroute(inboundEmail);

    await this.redirectTo(this.mainApp.trailsConductorInboundEmailUrl(inboundEmail));
  }

  /** @internal */
  private async reroute(inboundEmail: InboundEmail): Promise<void> {
    await inboundEmail.pendingBang();
    await inboundEmail.routeLater();
  }
}
