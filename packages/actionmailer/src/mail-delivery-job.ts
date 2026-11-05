import { Base as ActiveJobBase } from "@blazetrails/activejob";
import { constantize } from "@blazetrails/activesupport";
import { StandardError, rbFSend } from "@blazetrails/ruby-compat";
import { ActionMailer } from "./namespaces.js";

interface MailerClass {
  deliverLaterQueueName: unknown;
  with(params: unknown): unknown;
  handleException(exception: unknown): Promise<unknown>;
}

/** @internal */
export class MailDeliveryJob extends ActiveJobBase {
  async perform(
    mailer: string,
    mailMethod: string,
    deliveryMethod: string,
    {
      args,
      kwargs = null,
      params = null,
    }: { args: unknown[]; kwargs?: Record<string, unknown> | null; params?: unknown },
  ): Promise<unknown> {
    const mailerClass =
      params != null && params !== false
        ? (constantize(mailer) as MailerClass).with(params)
        : constantize(mailer);
    let message: unknown;
    if (kwargs != null) {
      message = rbFSend(mailerClass, mailMethod, ...args, kwargs);
    } else {
      message = rbFSend(mailerClass, mailMethod, ...args);
    }
    return await rbFSend(message, deliveryMethod);
  }

  /** @internal */
  private get mailerClass(): MailerClass | null {
    const mailer = [this._serializedArguments ?? []].flat()[0] ?? [this.arguments ?? []].flat()[0];
    if (mailer != null && mailer !== false) {
      return constantize(mailer as string) as MailerClass;
    }
    return null;
  }

  /** @internal */
  async handleExceptionWithMailerClass(exception: unknown): Promise<unknown> {
    const klass = this.mailerClass;
    if (klass != null) {
      return await klass.handleException(exception);
    } else {
      throw exception;
    }
  }
}

MailDeliveryJob.queueAs(null, function () {
  const mailerClass = constantize(
    (this as unknown as { arguments: unknown[] }).arguments[0] as string,
  ) as MailerClass;
  return mailerClass.deliverLaterQueueName;
});

MailDeliveryJob.rescueFrom(StandardError, { with: "handleExceptionWithMailerClass" });

ActionMailer.MailDeliveryJob = MailDeliveryJob;
