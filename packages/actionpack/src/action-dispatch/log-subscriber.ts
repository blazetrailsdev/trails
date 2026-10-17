import { HTTP_STATUS_CODES } from "@blazetrails/rack";
import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  TopLevel,
} from "@blazetrails/activesupport";
import { rbObjAsString, round } from "@blazetrails/ruby-compat";

export class LogSubscriber extends BaseLogSubscriber {
  redirect(event: Event): void {
    const payload = event.payload;

    this.info(() => `Redirected to ${rbObjAsString(payload.location)}`);

    this.info(() => {
      const status = payload.status as number;

      let message = `Completed ${rbObjAsString(status)} ${rbObjAsString(HTTP_STATUS_CODES[status])} in ${round(event.duration)}ms`;
      if (TopLevel.Trails !== undefined && TopLevel.Trails.env["development?"]()) message += "\n\n";

      return message;
    });
  }
}

LogSubscriber.subscribeLogLevel("redirect", "info");
