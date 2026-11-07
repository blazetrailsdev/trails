import { Mail, type BccField, type Message } from "@blazetrails/mail";
import type { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import type { InboundEmail } from "./inbound-email.js";
import { ActionMailbox } from "./action-mailbox.js";

type MailBlock = (this: Message, mail: Message) => unknown;

interface MailOptions {
  status?: string;
  [key: string]: unknown;
}

export const TestHelper: TestHelper & ThisType<TestHelper> = {
  async createInboundEmailFromFixture(
    this: ActiveSupportTestCase & TestHelper,
    fixtureName: string,
    { status = "processing" }: { status?: string } = {},
  ): Promise<InboundEmail> {
    return await this.createInboundEmailFromSource(await this.fileFixture(fixtureName).read(), {
      status: status,
    });
  },

  async createInboundEmailFromMail(
    this: TestHelper,
    options: MailOptions | MailBlock = {},
    block: MailBlock | null = null,
  ): Promise<InboundEmail> {
    if (typeof options === "function") [options, block] = [{}, options];
    const { status = "processing", ...mailOptions } = options;
    const mail = block != null ? Mail.new(mailOptions, block) : Mail.new(mailOptions);
    if (mail.get("bcc") != null) (mail.get("bcc") as unknown as BccField).includeInHeaders = true;

    return await this.createInboundEmailFromSource(mail.toString(), { status: status });
  },

  async createInboundEmailFromSource(
    source: string,
    { status = "processing" }: { status?: string } = {},
  ): Promise<InboundEmail> {
    return (await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(source, {
      status: status,
    }))!;
  },

  async receiveInboundEmailFromFixture(
    this: TestHelper,
    ...args: [fixtureName: string, options?: { status?: string }]
  ): Promise<InboundEmail> {
    const inboundEmail = await this.createInboundEmailFromFixture(...args);
    await inboundEmail.route();
    return inboundEmail;
  },

  async receiveInboundEmailFromMail(
    this: TestHelper,
    kwargs: MailOptions | MailBlock = {},
    block: MailBlock | null = null,
  ): Promise<InboundEmail> {
    const inboundEmail = await this.createInboundEmailFromMail(kwargs as MailOptions, block);
    await inboundEmail.route();
    return inboundEmail;
  },

  async receiveInboundEmailFromSource(
    this: TestHelper,
    ...args: [source: string, options?: { status?: string }]
  ): Promise<InboundEmail> {
    const inboundEmail = await this.createInboundEmailFromSource(...args);
    await inboundEmail.route();
    return inboundEmail;
  },
};

export interface TestHelper {
  createInboundEmailFromFixture(
    fixtureName: string,
    options?: { status?: string },
  ): Promise<InboundEmail>;
  createInboundEmailFromMail(block: MailBlock): Promise<InboundEmail>;
  createInboundEmailFromMail(
    options?: MailOptions,
    block?: MailBlock | null,
  ): Promise<InboundEmail>;
  createInboundEmailFromSource(
    source: string,
    options?: { status?: string },
  ): Promise<InboundEmail>;
  receiveInboundEmailFromFixture(
    fixtureName: string,
    options?: { status?: string },
  ): Promise<InboundEmail>;
  receiveInboundEmailFromMail(block: MailBlock): Promise<InboundEmail>;
  receiveInboundEmailFromMail(
    kwargs?: MailOptions,
    block?: MailBlock | null,
  ): Promise<InboundEmail>;
  receiveInboundEmailFromSource(
    source: string,
    options?: { status?: string },
  ): Promise<InboundEmail>;
}
