import { Trails } from "@blazetrails/trailties";
import { constGet, constSet } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../../../../../action-mailbox.js";
import "../../../../action-mailbox/base-controller.js";

export class SourcesController extends Trails.Conductor.BaseController {
  new(): void {}

  async create(): Promise<void> {
    const inboundEmail = await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(
      this.params.get("source") as string,
    );
    await this.redirectTo(this.mainApp.trailsConductorInboundEmailUrl(inboundEmail));
  }
}

constSet(
  constGet(Trails, "Conductor::ActionMailbox::InboundEmails") as object,
  "SourcesController",
  SourcesController,
);
