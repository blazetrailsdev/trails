import { ActionDispatch } from "@blazetrails/actionpack";
import { constSet } from "@blazetrails/ruby-compat";
import type { Logger } from "@blazetrails/activesupport";
import { Encoding, JSON, rbStrPlus } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../../../../../action-mailbox.js";
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
      return this.head(ActionDispatch.Constants.UNPROCESSABLE_CONTENT);
    }
  }

  /** @internal */
  private mail(): Uint8Array {
    let rawEmail = this.params.require("email") as Uint8Array;
    if (this.params.isKey("envelope"))
      (this.envelope()["to"] as string[]).forEach((to) => {
        rawEmail = rbStrPlus(
          new TextEncoder().encode(`X-Original-To: ${to}\n`),
          rawEmail,
        ) as Uint8Array;
      });
    return rawEmail;
  }

  /** @internal */
  private envelope(): Record<string, unknown> {
    return JSON.parse(this.params.require("envelope") as string) as Record<string, unknown>;
  }
}

constSet(
  (ActionMailbox as unknown as Record<string, Record<string, object>>).Ingresses.Sendgrid,
  "InboundEmailsController",
  InboundEmailsController,
);
