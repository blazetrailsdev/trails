import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

export class AuthLogin extends Authenticator {
  static {
    this.authType("login");
  }

  /** @missingRailsArgs finish — PERMANENT */
  auth(user: string, secret: string): Promise<Response> {
    return this.finish({ credentials: { user, pass: secret }, method: "LOGIN" });
  }
}
