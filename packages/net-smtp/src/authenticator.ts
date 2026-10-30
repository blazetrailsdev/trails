import type SMTPConnection from "nodemailer/lib/smtp-connection/index.js";
import { ArgumentError } from "@blazetrails/ruby-compat";
import type { Response } from "./smtp.js";

interface AuthHost {
  _socket: (SMTPConnection & { lastServerResponse: string | false }) | null;
}

type AuthClass = (new (smtp: AuthHost) => Authenticator) & typeof Authenticator;

export abstract class Authenticator {
  private static _classes: Record<string, AuthClass> = {};

  static authClasses(): Record<string, AuthClass> {
    return Authenticator._classes;
  }

  static authType(type: string): void {
    const key = type.toUpperCase().replaceAll("_", "-");
    Authenticator.authClasses()[key] = this as unknown as AuthClass;
  }

  static authClass(type: string): AuthClass | undefined {
    return Authenticator.authClasses()[type.toUpperCase().replaceAll("_", "-")];
  }

  static checkArgs(userArg: string | null = null, secretArg: string | null = null): void {
    if (userArg == null) throw new ArgumentError("SMTP-AUTH requested but missing user name");
    if (secretArg == null) throw new ArgumentError("SMTP-AUTH requested but missing secret phrase");
  }

  readonly smtp: AuthHost;
  abstract auth(user: string, secret: string): Promise<Response>;

  constructor(smtp: AuthHost) {
    this.smtp = smtp;
  }

  /** @missingRailsCall get_response — PERMANENT */
  finish(
    arg: SMTPConnection.AuthenticationCredentials | SMTPConnection.AuthenticationOAuth2,
  ): Promise<Response> {
    const socket = this.smtp._socket!;
    return new Promise((resolve, reject) => {
      socket.login(arg, (err) => {
        if (err) return reject(err);
        const { Response } = this.smtp.constructor as unknown as {
          Response: typeof import("./smtp.js").Response;
        };
        resolve(Response.parse(`${String(socket.lastServerResponse)}\n`));
      });
    });
  }
}
