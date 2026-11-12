import { isPresent } from "@blazetrails/activesupport";
import type { Parameters, UploadedFile } from "@blazetrails/actionpack";
import { Mail, type Message } from "@blazetrails/mail";
import { Trails } from "@blazetrails/trailties";
import { ActionMailbox } from "../action-mailbox.js";
import type { InboundEmail } from "../inbound-email.js";
import "../base-controller.js";

type MainApp = Record<string, (...args: unknown[]) => string>;

export class InboundEmailsController extends Trails.Conductor.BaseController {
  /** @internal */
  declare inboundEmails: InboundEmail[];
  /** @internal */
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
    this.redirectTo(
      (this as unknown as { mainApp: MainApp }).mainApp.trailsConductorInboundEmailUrl(
        inboundEmail,
      ),
    );
  }

  /** @internal */
  private async newMail(): Promise<Message> {
    const mailParams = this.mailParams();
    const mail = Mail.new(mailParams.except("attachments").toH());
    const bcc = mail.get("bcc") as { includeInHeaders: boolean } | null;
    if (bcc != null) bcc.includeInHeaders = true;
    const attachments = mailParams.get("attachments") as (UploadedFile | string)[] | null;
    for (const attachment of attachments?.filter((a) => isPresent(a)) ?? []) {
      const upload = attachment as UploadedFile;
      await mail.addFile({ filename: upload.originalFilename!, content: upload.read() });
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
      ],
    }) as Parameters;
  }

  /** @internal */
  private async createInboundEmail(mail: Message): Promise<InboundEmail> {
    return (await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(mail.toString()))!;
  }
}

Trails.Conductor.ActionMailbox.InboundEmailsController = InboundEmailsController;
