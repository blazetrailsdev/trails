import type { Logger } from "@blazetrails/activesupport";
import { Encoding, JSON } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../action-mailbox.js";
import { BaseController } from "../../base-controller.js";

export class InboundEmailsController extends BaseController {
  static {
    this.beforeAction(":authenticateByPassword");
    this.paramEncoding("create", "email", Encoding.ASCII_8BIT);
  }

  async create(): Promise<unknown> {
    try {
      return await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(this.mail());
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      (this as unknown as { logger?: Logger }).logger?.error(error.message);
      return this.head(":unprocessable_entity");
    }
  }

  /** @internal */
  private mail(): string {
    let rawEmail = this.params.require("email") as string;
    if (this.params.isKey("envelope"))
      (this.envelope()["to"] as string[]).forEach((to) => {
        rawEmail = `X-Original-To: ${to}\n${rawEmail}`;
      });
    return rawEmail;
  }

  /** @internal */
  private envelope(): Record<string, unknown> {
    return JSON.parse(this.params.require("envelope") as string) as Record<string, unknown>;
  }
}

ActionMailbox.Ingresses.Sendgrid.InboundEmailsController = InboundEmailsController;
