import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  type Logger,
} from "@blazetrails/activesupport";
import { rbInspect, rbModName, rbObjAsString, rbObjClass, round } from "@blazetrails/ruby-compat";
import { ActionMailer } from "./namespaces.js";

export class LogSubscriber extends BaseLogSubscriber {
  deliver(event: Event): void {
    this.info(null, () => {
      let exception: Error | null | undefined;
      if ((exception = event.payload.exception_object as Error | null | undefined) != null) {
        return `Failed delivery of mail ${rbObjAsString(event.payload.messageId)} error_class=${rbModName(rbObjClass(exception))} error_message=${rbInspect(exception.message)}`;
      } else if (
        event.payload.performDeliveries != null &&
        event.payload.performDeliveries !== false
      ) {
        return `Delivered mail ${rbObjAsString(event.payload.messageId)} (${round(event.duration, 1)}ms)`;
      } else {
        return `Skipped delivery of mail ${rbObjAsString(event.payload.messageId)} as \`perform_deliveries\` is false`;
      }
    });

    this.debug(null, () => event.payload.mail as string);
  }

  process(event: Event): void {
    this.debug(null, () => {
      const mailer = event.payload.mailer;
      const action = event.payload.action;
      return `${rbObjAsString(mailer)}#${rbObjAsString(action)}: processed outbound mail in ${round(event.duration, 1)}ms`;
    });
  }

  override get logger(): Logger | null {
    return ActionMailer.Base.logger;
  }
}
LogSubscriber.subscribeLogLevel("deliver", "debug");
LogSubscriber.subscribeLogLevel("process", "debug");

ActionMailer.LogSubscriber = LogSubscriber;

LogSubscriber.attachTo("action_mailer");
