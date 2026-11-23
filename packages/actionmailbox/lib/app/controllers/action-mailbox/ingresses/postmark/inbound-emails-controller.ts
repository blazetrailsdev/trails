import { ActionController } from "@blazetrails/actionpack";
import type { Logger } from "@blazetrails/activesupport";
import { Encoding, rbStrPlus } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../../../../action-mailbox.js";
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
      (this as unknown as { logger?: Logger }).logger?.error(`${error.message}

When configuring your Postmark inbound webhook, be sure to check the box
labeled "Include raw email content in JSON payload".
`);
      return this.head(":unprocessable_entity");
    }
  }

  /** @internal */
  private mail(): Uint8Array {
    let rawEmail = this.params.require("RawEmail") as Uint8Array;
    if (this.params.isKey("OriginalRecipient"))
      rawEmail = rbStrPlus(
        new TextEncoder().encode(
          `X-Original-To: ${this.params.require("OriginalRecipient") as string}\n`,
        ),
        rawEmail,
      ) as Uint8Array;
    return rawEmail;
  }
}
