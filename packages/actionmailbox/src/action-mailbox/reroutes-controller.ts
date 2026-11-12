import { Trails } from "@blazetrails/trailties";
import { ActionMailbox } from "../action-mailbox.js";
import type { InboundEmail } from "../inbound-email.js";
import "../base-controller.js";

type MainApp = Record<string, (...args: unknown[]) => string>;

export class ReroutesController extends Trails.Conductor.BaseController {
  async create(): Promise<void> {
    const inboundEmail = await ActionMailbox.InboundEmail.find(this.params.get("inbound_email_id"));
    await this.reroute(inboundEmail);

    this.redirectTo(
      (this as unknown as { mainApp: MainApp }).mainApp.trailsConductorInboundEmailUrl(
        inboundEmail,
      ),
    );
  }

  /** @internal */
  private async reroute(inboundEmail: InboundEmail): Promise<void> {
    await inboundEmail.pendingBang();
    await inboundEmail.routeLater();
  }
}

Trails.Conductor.ActionMailbox.ReroutesController = ReroutesController;
