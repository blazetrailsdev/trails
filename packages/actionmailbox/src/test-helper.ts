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
  ): Promise<InboundEmail | null> {
    return await this.createInboundEmailFromSource(await this.fileFixture(fixtureName).read(), {
      status: status,
    });
  },

  async createInboundEmailFromMail(
    this: TestHelper,
    options: MailOptions | MailBlock = {},
    block: MailBlock | null = null,
  ): Promise<InboundEmail | null> {
    if (typeof options === "function") [options, block] = [{}, options];
    const { status = "processing", ...mailOptions } = options;
    const mail = block != null ? Mail.new(mailOptions, block) : Mail.new(mailOptions);
    if (mail.get("bcc") != null) (mail.get("bcc") as unknown as BccField).includeInHeaders = true;

    return await this.createInboundEmailFromSource(mail.toString(), { status: status });
  },

  async createInboundEmailFromSource(
    source: string,
    { status = "processing" }: { status?: string } = {},
  ): Promise<InboundEmail | null> {
    return await ActionMailbox.InboundEmail.createAndExtractMessageIdBang(source, {
      status: status,
    });
  },

  async receiveInboundEmailFromFixture(
    this: TestHelper,
    ...args: [fixtureName: string, options?: { status?: string }]
  ): Promise<InboundEmail | null> {
    const inboundEmail = await this.createInboundEmailFromFixture(...args);
    await inboundEmail!.route();
    return inboundEmail;
  },

  async receiveInboundEmailFromMail(
    this: TestHelper,
    kwargs: MailOptions | MailBlock = {},
    block: MailBlock | null = null,
  ): Promise<InboundEmail | null> {
    if (typeof kwargs === "function") [kwargs, block] = [{}, kwargs];
    const inboundEmail = await this.createInboundEmailFromMail(kwargs, block);
    await inboundEmail!.route();
    return inboundEmail;
  },

  async receiveInboundEmailFromSource(
    this: TestHelper,
    ...args: [source: string, options?: { status?: string }]
  ): Promise<InboundEmail | null> {
    const inboundEmail = await this.createInboundEmailFromSource(...args);
    await inboundEmail!.route();
    return inboundEmail;
  },
};

export interface TestHelper {
  createInboundEmailFromFixture(
    fixtureName: string,
    options?: { status?: string },
  ): Promise<InboundEmail | null>;
  createInboundEmailFromMail(block: MailBlock): Promise<InboundEmail | null>;
  createInboundEmailFromMail(
    options?: MailOptions,
    block?: MailBlock | null,
  ): Promise<InboundEmail | null>;
  createInboundEmailFromSource(
    source: string,
    options?: { status?: string },
  ): Promise<InboundEmail | null>;
  receiveInboundEmailFromFixture(
    fixtureName: string,
    options?: { status?: string },
  ): Promise<InboundEmail | null>;
  receiveInboundEmailFromMail(block: MailBlock): Promise<InboundEmail | null>;
  receiveInboundEmailFromMail(
    kwargs?: MailOptions,
    block?: MailBlock | null,
  ): Promise<InboundEmail | null>;
  receiveInboundEmailFromSource(
    source: string,
    options?: { status?: string },
  ): Promise<InboundEmail | null>;
}
