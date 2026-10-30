import { Authenticator } from "./authenticator.js";

export class AuthPlain extends Authenticator {
  static {
    this.authType("plain");
  }

  auth(user: string, secret: string): Promise<string> {
    return this.finish({ credentials: { user, pass: secret }, method: "PLAIN" });
  }
}
