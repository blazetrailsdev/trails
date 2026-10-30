import { Authenticator } from "./authenticator.js";

export class AuthCramMD5 extends Authenticator {
  static {
    this.authType("cram_md5");
  }

  /** @missingRailsArgs finish — PERMANENT */
  auth(user: string, secret: string): Promise<string> {
    return this.finish({ credentials: { user, pass: secret }, method: "CRAM-MD5" });
  }
}
