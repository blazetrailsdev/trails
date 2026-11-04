import { Mail } from "./mail.js";

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
        return Mail.SMTP;
      case "smtp":
        return Mail.SMTP;
      case "sendmail":
        return Mail.Sendmail;
      case "exim":
        return Mail.Exim;
      case "file":
        return Mail.FileDelivery;
      case "smtp_connection":
        return Mail.SMTPConnection;
      case "test":
        return Mail.TestMailer;
      case "logger":
        return Mail.LoggerDelivery;
      default:
        return method;
    }
  }

  paramEncodeLanguage(value: string | null = null): string {
    return value != null ? (this._encodeLanguage = value) : (this._encodeLanguage ||= "en");
  }
}
