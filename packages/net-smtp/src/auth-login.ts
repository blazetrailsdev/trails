import { Authenticator } from "./authenticator.js";
import type { Response } from "./smtp.js";

export class AuthLogin extends Authenticator {
  static {
    this.authType("login");
  }

  async auth(user: string, secret: string): Promise<Response> {
    await this.continue("AUTH LOGIN");
    await this.continue(this.base64Encode(user));
    return await this.finish(this.base64Encode(secret));
  }
}
