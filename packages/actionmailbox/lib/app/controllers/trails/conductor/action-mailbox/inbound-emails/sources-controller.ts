import { ActionMailbox } from "../../../../../../action-mailbox.js";
import { BaseController } from "../../base-controller.js";

export class SourcesController extends BaseController {
  new(): void {}

  async create(): Promise<void> {
    const inboundEmail = await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(
      this.params.get("source") as string,
    );
    await this.redirectTo(this.mainApp.trailsConductorInboundEmailUrl(inboundEmail));
  }
}
