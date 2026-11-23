import { ApplicationController } from "./application-controller.ts";
import { User } from "../models/user.ts";

export class MagicLinksController extends ApplicationController {
  static {
    this.allowUnauthenticatedAccess();
  }

  /** Redeems a magic link. Starting the session touches the user, which invalidates the token. */
  async show(): Promise<void> {
    const user = await User.findByTokenFor("magic_link", String(this.params.get("token")));
    if (user) {
      await user.touch();
      await this.startNewSessionFor(user);
      await this.redirectTo(this.afterAuthenticationUrl(), {
        notice: `Welcome, ${user.displayName()}!`,
      });
    } else {
      await this.redirectTo(this.newSessionPath(), {
        alert: "That sign-in link is invalid or has expired.",
      });
    }
  }
}
