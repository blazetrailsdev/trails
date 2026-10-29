import {
  LogSubscriber as BaseLogSubscriber,
  NotificationEvent as Event,
  type Logger,
} from "@blazetrails/activesupport";
import { round } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";

export class LogSubscriber extends BaseLogSubscriber {
  serviceUpload(event: Event): void {
    let message = `Uploaded file to key: ${this.keyIn(event)}`;
    if (event.payload.checksum) message += ` (checksum: ${event.payload.checksum})`;
    this.info(event, this.color(message, LogSubscriber.GREEN));
  }

  serviceDownload(event: Event): void {
    this.info(
      event,
      this.color(`Downloaded file from key: ${this.keyIn(event)}`, LogSubscriber.BLUE),
    );
  }

  serviceStreamingDownload(event: Event): void {
    this.serviceDownload(event);
  }

  preview(event: Event): void {
    this.info(
      event,
      this.color(`Previewed file from key: ${this.keyIn(event)}`, LogSubscriber.BLUE),
    );
  }

  serviceDelete(event: Event): void {
    this.info(event, this.color(`Deleted file from key: ${this.keyIn(event)}`, LogSubscriber.RED));
  }

  serviceDeletePrefixed(event: Event): void {
    this.info(
      event,
      this.color(`Deleted files by key prefix: ${event.payload.prefix}`, LogSubscriber.RED),
    );
  }

  serviceExist(event: Event): void {
    this.debug(
      event,
      this.color(
        `Checked if file exists at key: ${this.keyIn(event)} (${event.payload.exist ? "yes" : "no"})`,
        LogSubscriber.BLUE,
      ),
    );
  }

  serviceUrl(event: Event): void {
    this.debug(
      event,
      this.color(
        `Generated URL for file at key: ${this.keyIn(event)} (${event.payload.url})`,
        LogSubscriber.BLUE,
      ),
    );
  }

  serviceMirror(event: Event): void {
    let message = `Mirrored file at key: ${this.keyIn(event)}`;
    if (event.payload.checksum) message += ` (checksum: ${event.payload.checksum})`;
    this.debug(event, this.color(message, LogSubscriber.GREEN));
  }

  override get logger(): Logger | null {
    return ActiveStorage.logger;
  }

  /** @internal */
  protected override info(
    event: Event | string | null = null,
    coloredMessage?: string | (() => string),
  ): boolean | null {
    return super.info(this.logPrefixForService(event as Event) + (coloredMessage as string));
  }

  /** @internal */
  protected override debug(
    event: Event | string | null = null,
    coloredMessage?: string | (() => string),
  ): boolean | null {
    return super.debug(this.logPrefixForService(event as Event) + (coloredMessage as string));
  }

  /** @internal */
  private logPrefixForService(event: Event): string {
    return this.color(
      `  ${event.payload.service} Storage (${round(event.duration, 1)}ms) `,
      LogSubscriber.CYAN,
    );
  }

  /** @internal */
  private keyIn(event: Event): unknown {
    return event.payload.key;
  }
}

LogSubscriber.subscribeLogLevel("service_upload", "info");
LogSubscriber.subscribeLogLevel("service_download", "info");
LogSubscriber.subscribeLogLevel("preview", "info");
LogSubscriber.subscribeLogLevel("service_delete", "info");
LogSubscriber.subscribeLogLevel("service_delete_prefixed", "info");
LogSubscriber.subscribeLogLevel("service_exist", "debug");
LogSubscriber.subscribeLogLevel("service_url", "debug");
LogSubscriber.subscribeLogLevel("service_mirror", "debug");

ActiveStorage.LogSubscriber = LogSubscriber;

LogSubscriber.attachTo("active_storage");
