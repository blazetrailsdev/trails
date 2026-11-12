import { Trails } from "@blazetrails/trailties";
import { ActionMailbox } from "../../action-mailbox.js";
import "../../base-controller.js";

export class SourcesController extends Trails.Conductor.BaseController {
  new(): void {}

  async create(): Promise<void> {
    const inboundEmail = await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(
      this.params.get("source") as string,
    );
    this.redirectTo(this.mainApp.trailsConductorInboundEmailUrl(inboundEmail));
  }
}

Trails.Conductor.ActionMailbox.InboundEmails.SourcesController = SourcesController;
