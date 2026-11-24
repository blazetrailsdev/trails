import { HTTP_STATUS_CODES } from "@blazetrails/rack";
import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  TopLevel,
} from "@blazetrails/activesupport";
import { rbObjAsString } from "@blazetrails/ruby-compat/object";

export class LogSubscriber extends BaseLogSubscriber {
  redirect(event: Event): void {
    const payload = event.payload;

    this.info(undefined, () => `Redirected to ${rbObjAsString(payload.location)}`);

    this.info(undefined, () => {
      const status = payload.status as number;

      let message = `Completed ${rbObjAsString(status)} ${rbObjAsString(HTTP_STATUS_CODES[status])} in ${Math.round(event.duration)}ms`;
      if (TopLevel.Trails?.env !== undefined && TopLevel.Trails.env.isDevelopment())
        message += "\n\n";

      return message;
    });
  }
}

LogSubscriber.subscribeLogLevel("redirect", "info");
