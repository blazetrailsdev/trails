import { isPresent } from "@blazetrails/activesupport";
import type { Parameters, UploadedFile } from "@blazetrails/actionpack";
import { Mail, type Message } from "@blazetrails/mail";
import { Trails } from "@blazetrails/trailties";
import { ActionMailbox } from "../action-mailbox.js";
import type { InboundEmail } from "../inbound-email.js";
import "../base-controller.js";

export class InboundEmailsController extends Trails.Conductor.BaseController {
  declare inboundEmails: InboundEmail[];
  declare inboundEmail: InboundEmail;

  async index(): Promise<void> {
    this.inboundEmails = await ActionMailbox.InboundEmail.order({ created_at: "desc" });
  }

  new(): void {}

  async show(): Promise<void> {
    this.inboundEmail = await ActionMailbox.InboundEmail.find(this.params.get("id"));
  }

  async create(): Promise<void> {
    const inboundEmail = await this.createInboundEmail(await this.newMail());
    this.redirectTo(this.mainApp.trailsConductorInboundEmailUrl(inboundEmail));
  }

  /** @internal */
  private async newMail(): Promise<Message> {
    const mail = Mail.new(this.mailParams().except("attachments").toH());
    const bcc = mail.get("bcc") as { includeInHeaders: boolean } | null;
    if (bcc != null) bcc.includeInHeaders = true;
    const attachments = this.mailParams().get("attachments") as UploadedFile[] | null;
    for (const attachment of attachments?.filter((a) => isPresent(a)) ?? []) {
      await mail.addFile({ filename: attachment.originalFilename!, content: attachment.read() });
    }
    return mail;
  }

  /** @internal */
  private mailParams(): Parameters {
    return this.params.expect({
      mail: [
        "from",
        "to",
        "cc",
        "bcc",
        "x_original_to",
        "in_reply_to",
        "subject",
        "body",
        { attachments: [] },
      ] as const,
    });
  }

  /** @internal */
  private async createInboundEmail(mail: Message): Promise<InboundEmail | null> {
    return ActionMailbox.InboundEmail.createAndExtractMessageIdBang(mail.toString());
  }
}

Trails.Conductor.ActionMailbox.InboundEmailsController = InboundEmailsController;
