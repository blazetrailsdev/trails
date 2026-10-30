import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

export class AuthCramMD5 extends Authenticator {
  static {
    this.authType("cram_md5");
  }

  /** @missingRailsArgs finish — PERMANENT */
  auth(user: string, secret: string): Promise<Response> {
    return this.finish({ credentials: { user, pass: secret }, method: "CRAM-MD5" });
  }
}
