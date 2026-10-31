import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

export class AuthPlain extends Authenticator {
  static {
    this.authType("plain");
  }

  auth(user: string, secret: string): Promise<Response> {
    return this.finish("AUTH PLAIN " + this.base64Encode(`\0${user}\0${secret}`));
  }
}
