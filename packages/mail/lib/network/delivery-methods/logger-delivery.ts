import { Mail } from "../../mail.js";
import { Logger, STDOUT, constGet } from "@blazetrails/ruby-compat";
import { SmtpEnvelope } from "../../smtp-envelope.js";
import type { Message } from "../../message.js";

export class LoggerDelivery {
  readonly logger: Logger;
  readonly severity: number;
  readonly settings: Record<string, unknown>;

  constructor(settings: Record<string, unknown>) {
    this.settings = settings;
    this.logger = Object.hasOwn(settings, "logger")
      ? (settings.logger as Logger)
      : this.defaultLogger();
    this.severity = this.deriveSeverity(settings.severity);
  }

  async deliverBang(mail: Message): Promise<boolean> {
    return this.logger.log(this.severity, null, null, () => new SmtpEnvelope(mail).message);
  }

  /**
   * @internal
   * @missingRailsArgs new — PERMANENT
   */
  private defaultLogger(): Logger {
    return new Logger(STDOUT);
  }

  /** @internal */
  private deriveSeverity(severity: unknown): number {
    if (severity == null) {
      return Logger.INFO;
    } else if (Number.isInteger(severity)) {
      return severity as number;
    } else {
      return constGet(Logger, String(severity).toUpperCase()) as number;
    }
  }
}

Mail.LoggerDelivery = LoggerDelivery;
