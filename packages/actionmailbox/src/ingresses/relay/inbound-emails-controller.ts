import { ActionMailbox } from "../../action-mailbox.js";
import { BaseController } from "../../base-controller.js";

export class InboundEmailsController extends BaseController {
  static {
    this.beforeAction(":authenticateByPassword", ":requireValidRfc822Message");
  }

  async create(): Promise<unknown> {
    if (this.request.body != null) {
      return await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(
        await this.request.body.read(),
      );
    } else {
      return this.head(":unprocessable_entity");
    }
  }

  /** @internal */
  private requireValidRfc822Message(): void {
    if (!(this.request.mediaType === "message/rfc822")) {
      this.head(":unsupported_media_type");
    }
  }
}

ActionMailbox.Ingresses.Relay.InboundEmailsController = InboundEmailsController;
