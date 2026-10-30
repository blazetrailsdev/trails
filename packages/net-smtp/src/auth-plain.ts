import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

export class AuthPlain extends Authenticator {
  static {
    this.authType("plain");
  }

  auth(user: string, secret: string): Promise<Response> {
    return this.finish({ credentials: { user, pass: secret }, method: "PLAIN" });
  }
}
