import { SmtpEnvelope } from "../../smtp-envelope.js";
import type { Message } from "../../message.js";

export class TestMailer {
  private static _deliveries: Message[] | null = null;

  static get deliveries(): Message[] {
    return (TestMailer._deliveries ||= []);
  }

  static set deliveries(val: Message[]) {
    TestMailer._deliveries = val;
  }

  settings: Record<string, unknown>;

  constructor(values: Record<string, unknown>) {
    this.settings = { ...values };
  }

  async deliverBang(mail: Message): Promise<Message[]> {
    new SmtpEnvelope(mail);

    TestMailer.deliveries.push(mail);
    return TestMailer.deliveries;
  }
}
