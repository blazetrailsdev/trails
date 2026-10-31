import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

export class AuthXoauth2 extends Authenticator {
  static {
    this.authType("xoauth2");
  }

  auth(user: string, secret: string): Promise<Response> {
    const token = this.xoauth2String(user, secret);

    return this.finish(`AUTH XOAUTH2 ${this.base64Encode(token)}`);
  }

  /** @internal */
  private xoauth2String(user: string, secret: string): string {
    return `user=${user}\x01auth=Bearer ${secret}\x01\x01`;
  }
}
