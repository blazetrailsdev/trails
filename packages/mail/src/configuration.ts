import { Exim } from "./network/delivery-methods/exim.js";
import { FileDelivery } from "./network/delivery-methods/file-delivery.js";
import { LoggerDelivery } from "./network/delivery-methods/logger-delivery.js";
import { Sendmail } from "./network/delivery-methods/sendmail.js";
import { SMTP } from "./network/delivery-methods/smtp.js";
import { SMTPConnection } from "./network/delivery-methods/smtp-connection.js";
import { TestMailer } from "./network/delivery-methods/test-mailer.js";

export class Configuration {
  private static _instance: Configuration | null = null;

  private _encodeLanguage: string | null = null;
  private _deliveryMethod: unknown = null;

  static instance(): Configuration {
    return (Configuration._instance ||= new Configuration());
  }

  deliveryMethod(method: unknown = null, settings: Record<string, unknown> = {}): unknown {
    if (this._deliveryMethod != null && method == null) return this._deliveryMethod;
    const klass = this.lookupDeliveryMethod(method) as new (
      settings: Record<string, unknown>,
    ) => unknown;
    return (this._deliveryMethod = new klass(settings));
  }

  lookupDeliveryMethod(method: unknown): unknown {
    switch (method) {
      case null:
      case undefined:
        return SMTP;
      case "smtp":
        return SMTP;
      case "sendmail":
        return Sendmail;
      case "exim":
        return Exim;
      case "file":
        return FileDelivery;
      case "smtp_connection":
        return SMTPConnection;
      case "test":
        return TestMailer;
      case "logger":
        return LoggerDelivery;
      default:
        return method;
    }
  }

  paramEncodeLanguage(value: string | null = null): string {
    return value != null ? (this._encodeLanguage = value) : (this._encodeLanguage ||= "en");
  }
}
