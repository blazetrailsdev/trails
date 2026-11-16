import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Message } from "../models/message.js";
import { ApplicationMailer } from "./application-mailer.js";

export class MessagesMailer extends ApplicationMailer {
  override message: never = null as never;

  notification() {
    this.message = this.params.message as never;
    return this.mail({
      to: this.params.recipient,
      subject: `NEW MESSAGE: ${(this.message as unknown as Message).subject}`,
    });
  }
}
constSet(TopLevel, "MessagesMailer", MessagesMailer);
