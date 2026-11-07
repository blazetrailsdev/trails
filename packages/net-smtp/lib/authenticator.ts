import { ArgumentError, pack } from "@blazetrails/ruby-compat";
import { Net } from "./protocol.js";
import type { Response } from "./smtp.js";

interface AuthHost {
  getResponse(reqline: string): Promise<Response>;
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

  async continue(arg: string): Promise<string> {
    const res = await this.smtp.getResponse(arg);
    if (!res.isContinue()) throw new res.exceptionClass(res);
    return res.string.trim().split(/\s+/)[1];
  }

  async finish(arg: string): Promise<Response> {
    const res = await this.smtp.getResponse(arg);
    if (!res.isSuccess()) throw new Net.SMTPAuthenticationError!(res);
    return res;
  }

  base64Encode(str: string): string {
    return pack([str], "m0");
  }
}
