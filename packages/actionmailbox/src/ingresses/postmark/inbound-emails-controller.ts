import { ActionController } from "@blazetrails/actionpack";
import type { Logger } from "@blazetrails/activesupport";
import { Encoding } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../action-mailbox.js";
import { BaseController } from "../../base-controller.js";

export class InboundEmailsController extends BaseController {
  static {
    this.beforeAction(":authenticateByPassword");
    this.paramEncoding("create", "RawEmail", Encoding.ASCII_8BIT);
  }

  async create(): Promise<unknown> {
    try {
      return await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(this.mail());
    } catch (error) {
      if (!(error instanceof ActionController.ParameterMissing)) throw error;
      (this as unknown as { logger?: Logger }).logger?.error(`
When configuring your Postmark inbound webhook, be sure to check the box
labeled "Include raw email content in JSON payload".
`);
      return this.head(":unprocessable_entity");
    }
  }

  /** @internal */
  private mail(): string {
    let rawEmail = this.params.require("RawEmail") as string;
    if (this.params.isKey("OriginalRecipient"))
      rawEmail = `X-Original-To: ${this.params.require("OriginalRecipient") as string}\n${rawEmail}`;
    return rawEmail;
  }
}

ActionMailbox.Ingresses.Postmark.InboundEmailsController = InboundEmailsController;
