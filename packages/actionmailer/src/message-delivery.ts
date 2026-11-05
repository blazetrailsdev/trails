import { RuntimeError, rbModName } from "@blazetrails/ruby-compat";
import type { Message } from "@blazetrails/mail";
import { ActionMailer } from "./namespaces.js";

/** @internal */
export interface ProcessedMailer {
  process(action: string, ...args: unknown[]): Promise<unknown>;
  handleExceptions<T>(block: () => T | Promise<T>): Promise<unknown>;
  runCallbacks(kind: string, block: () => unknown): unknown;
  message: unknown;
  params?: unknown;
}

/** @internal */
export interface MailerClass {
  new (): ProcessedMailer;
  deliveryJob: {
    set(options: Record<string, unknown>): { performLater(...args: unknown[]): Promise<unknown> };
  };
}

export class MessageDelivery {
  /** @internal */
  protected _mailerClass: MailerClass;
  /** @internal */
  protected _action: string;
  /** @internal */
  protected _args: unknown[];
  /** @internal */
  protected _processedMailer: ProcessedMailer | null;
  /** @internal */
  protected _mailMessage: Message | null;

  constructor(mailerClass: MailerClass, action: string, ...args: unknown[]) {
    this._mailerClass = mailerClass;
    this._action = action;
    this._args = args;

    this._processedMailer = null;
    this._mailMessage = null;
  }

  /** @internal */
  async __getobj__(): Promise<Message> {
    return (this._mailMessage ||= (await this.processedMailer()).message as Message);
  }

  /** @internal */
  __setobj__(mailMessage: Message): void {
    this._mailMessage = mailMessage;
  }

  async message(): Promise<Message> {
    return await this.__getobj__();
  }

  isProcessed(): ProcessedMailer | Message | null {
    return this._processedMailer || this._mailMessage;
  }

  async deliverLaterBang(options: Record<string, unknown> = {}): Promise<unknown> {
    return await this.enqueueDelivery("deliverNowBang", options);
  }

  async deliverLater(options: Record<string, unknown> = {}): Promise<unknown> {
    return await this.enqueueDelivery("deliverNow", options);
  }

  async deliverNowBang(): Promise<unknown> {
    const processedMailer = await this.processedMailer();
    return await processedMailer.handleExceptions(() =>
      processedMailer.runCallbacks("deliver", async () => (await this.message()).deliverBang()),
    );
  }

  async deliverNow(): Promise<unknown> {
    const processedMailer = await this.processedMailer();
    return await processedMailer.handleExceptions(() =>
      processedMailer.runCallbacks("deliver", async () => (await this.message()).deliver()),
    );
  }

  /** @internal */
  protected async processedMailer(): Promise<ProcessedMailer> {
    if (this._processedMailer == null) {
      const mailer = new this._mailerClass();
      await mailer.process(this._action, ...this._args);
      this._processedMailer = mailer;
    }
    return this._processedMailer;
  }

  /** @internal */
  protected async enqueueDelivery(
    deliveryMethod: string,
    options: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (this.isProcessed()) {
      throw new RuntimeError(
        "You've accessed the message before asking to " +
          "deliver it later, so you may have made local changes that would " +
          "be silently lost if we enqueued a job to deliver it. Why? Only " +
          "the mailer method *arguments* are passed with the delivery job! " +
          "Do not access the message in any way if you mean to deliver it " +
          "later. Workarounds: 1. don't touch the message before calling " +
          "#deliver_later, 2. only touch the message *within your mailer " +
          "method*, or 3. use a custom Active Job instead of #deliver_later.",
      );
    } else {
      return await this._mailerClass.deliveryJob
        .set(options)
        .performLater(rbModName(this._mailerClass), this._action, deliveryMethod, {
          args: this._args,
        });
    }
  }
}

ActionMailer.MessageDelivery = MessageDelivery as never;
