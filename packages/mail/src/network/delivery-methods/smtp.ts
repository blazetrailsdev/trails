import { ArgumentError, block, rbInspect } from "@blazetrails/ruby-compat";
import { SMTP as NetSMTP } from "@blazetrails/net-smtp";
import { SMTPConnection } from "./smtp-connection.js";
import type { Message } from "../../message.js";

export class SMTP {
  settings: Record<string, unknown>;

  static readonly DEFAULTS: Record<string, unknown> = {
    address: "localhost",
    port: 25,
    domain: "localhost.localdomain",
    userName: null,
    password: null,
    authentication: null,
    enableStarttls: null,
    enableStarttlsAuto: true,
    opensslVerifyMode: null,
    ssl: null,
    tls: null,
    openTimeout: 5,
    readTimeout: 5,
  };

  constructor(values: Record<string, unknown>) {
    this.settings = { ...SMTP.DEFAULTS, ...values };
  }

  async deliverBang(mail: Message): Promise<unknown> {
    const response = await this.startSmtpSession(
      block((smtp: NetSMTP) =>
        new SMTPConnection({ connection: smtp, returnResponse: true }).deliverBang(mail),
      ),
    );

    return this.settings.returnResponse ? response : this;
  }

  /** @internal */
  private startSmtpSession(block: (smtp: NetSMTP) => unknown): Promise<unknown> {
    return this.buildSmtpSession().start(
      this.settings.domain,
      this.settings.userName,
      this.settings.password,
      this.settings.authentication,
      block,
    );
  }

  /**
   * @internal
   * @missingRailsCall include? — PERMANENT
   */
  private buildSmtpSession(): NetSMTP {
    const smtp = new NetSMTP(this.settings.address as string, this.settings.port as number);
    const tls = this.settings.tls || this.settings.ssl;
    if (tls != null) {
      switch (tls) {
        case true:
          smtp.enableTls(this.sslContext());
          break;
        case false:
          smtp.disableTls();
          break;
        default:
          throw new ArgumentError(
            `Unrecognized :tls value ${rbInspect(this.settings.tls)}; expected true, false, or nil`,
          );
      }
    } else if ("enableStarttls" in this.settings && this.settings.enableStarttls != null) {
      switch (this.settings.enableStarttls) {
        case true:
          smtp.enableStarttls(this.sslContext());
          break;
        case false:
          smtp.disableStarttls();
          break;
        default:
          throw new ArgumentError(
            `Unrecognized :enable_starttls value ${rbInspect(this.settings.enableStarttls)}; expected true, false, or nil`,
          );
      }
    } else if ("enableStarttlsAuto" in this.settings && this.settings.enableStarttlsAuto != null) {
      switch (this.settings.enableStarttlsAuto) {
        case true:
          smtp.enableStarttlsAuto(this.sslContext());
          break;
        case false:
          smtp.disableStarttls();
          break;
        default:
          throw new ArgumentError(
            `Unrecognized :enable_starttls_auto value ${rbInspect(this.settings.enableStarttlsAuto)}; expected true, false, or nil`,
          );
      }
    }

    if (this.settings.openTimeout) smtp.openTimeout = this.settings.openTimeout as number;
    if (this.settings.readTimeout) smtp.readTimeout = this.settings.readTimeout as number;
    return smtp;
  }

  /** @internal */
  private sslContext(): Record<string, unknown> {
    let opensslVerifyMode = this.settings.opensslVerifyMode;

    if (typeof opensslVerifyMode === "string") {
      opensslVerifyMode = `VERIFY_${opensslVerifyMode.toUpperCase()}`;
    }

    const context = NetSMTP.defaultSslContext();
    if (opensslVerifyMode != null && opensslVerifyMode !== false)
      context.verifyMode = opensslVerifyMode;
    if (this.settings.caPath) context.caPath = this.settings.caPath;
    if (this.settings.caFile) context.caFile = this.settings.caFile;
    return context;
  }
}
