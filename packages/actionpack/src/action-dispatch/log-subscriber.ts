import { HTTP_STATUS_CODES } from "@blazetrails/rack";
import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
} from "@blazetrails/activesupport";

export class LogSubscriber extends BaseLogSubscriber {
  redirect(event: Event): void {
    const payload = event.payload as { location?: string; status?: number };
    this._info(`Redirected to ${payload.location ?? ""}`);

    const status = payload.status ?? 302;
    const statusText = HTTP_STATUS_CODES[status] ?? "";
    this._info(`Completed ${status} ${statusText} in ${Math.round(event.duration)}ms`);
  }
}

LogSubscriber.subscribeLogLevel("redirect", "info");
