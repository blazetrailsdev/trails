import { ArgumentError } from "@blazetrails/ruby-compat";
import type { SMTP as NetSMTP } from "@blazetrails/net-smtp";
import { SmtpEnvelope } from "../../smtp-envelope.js";
import type { Message } from "../../message.js";

export class SMTPConnection {
  smtp: NetSMTP;
  settings: Record<string, unknown>;

  constructor(values: Record<string, unknown>) {
    if (values.connection == null)
      throw new ArgumentError("A Net::SMTP object is required for this delivery method");
    this.smtp = values.connection as NetSMTP;
    this.settings = values;
  }

  async deliverBang(mail: Message): Promise<unknown> {
    const envelope = new SmtpEnvelope(mail);
    const response = await this.smtp.sendmail(envelope.message, envelope.from, envelope.to);
    return this.settings.returnResponse ? response : this;
  }
}
