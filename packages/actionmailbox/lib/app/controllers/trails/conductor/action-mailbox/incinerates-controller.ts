import { ActionMailbox } from "../../../../../action-mailbox.js";
import { BaseController } from "../base-controller.js";

export class IncineratesController extends BaseController {
  async create(): Promise<void> {
    await (await ActionMailbox.InboundEmail.find(this.params.get("inbound_email_id"))).incinerate();

    await this.redirectTo(this.mainApp.trailsConductorInboundEmailsUrl());
  }
}
