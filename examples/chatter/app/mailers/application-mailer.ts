import { Base } from "@blazetrails/actionmailer";

export class ApplicationMailer extends Base {
  static {
    this.default({ from: process.env.MAILER_FROM ?? "Chatter <chatter@deanoftech.com>" });
    this.layout("mailer");
  }
}
