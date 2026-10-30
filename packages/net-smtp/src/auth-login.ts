import { Authenticator } from "./authenticator.js";

export class AuthLogin extends Authenticator {
  static {
    this.authType("login");
  }

  /** @missingRailsArgs finish — PERMANENT */
  auth(user: string, secret: string): Promise<string> {
    return this.finish({ credentials: { user, pass: secret }, method: "LOGIN" });
  }
}
