import { ActionDispatch } from "@blazetrails/actionpack";
import { constSet } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../../../../action-mailbox.js";
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
      return this.head(ActionDispatch.Constants.UNPROCESSABLE_CONTENT);
    }
  }

  /** @internal */
  private async requireValidRfc822Message(): Promise<void> {
    if (!(this.request.mediaType === "message/rfc822")) {
      await this.head(":unsupported_media_type");
    }
  }
}

constSet(
  (ActionMailbox as unknown as Record<string, Record<string, object>>).Ingresses.Relay,
  "InboundEmailsController",
  InboundEmailsController,
);
