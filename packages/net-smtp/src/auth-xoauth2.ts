import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

export class AuthXoauth2 extends Authenticator {
  static {
    this.authType("xoauth2");
  }

  auth(user: string, secret: string): Promise<Response> {
    return this.finish({
      type: "OAUTH2",
      user,
      method: "XOAUTH2",
      oauth2: {
        getToken: (_renew: boolean, cb: (err: null, token: string) => void) => cb(null, secret),
        buildXOAuth2Token: (token: string) => btoa(`user=${user}\x01auth=Bearer ${token}\x01\x01`),
      },
    } as never);
  }
}
