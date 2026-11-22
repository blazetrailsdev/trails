import { minutes } from "@blazetrails/activesupport";
import { ApplicationController } from "./application-controller.ts";
import { User } from "../models/user.ts";
import { MagicLinksMailer } from "../mailers/magic-links-mailer.ts";

export class SessionsController extends ApplicationController {
  static {
    this.allowUnauthenticatedAccess({ only: ["new", "create", "sent"] });
    this.rateLimit({
      to: 10,
      within: minutes(3),
      only: "create",
      with: async function (this: SessionsController) {
        await this.redirectTo(this.newSessionUrl(), { alert: "Try again later." });
      },
    });
    this.layout("auth");
  }

  async new(): Promise<void> {}

  /** Finds or creates the user for the address and emails them a one-time sign-in link. */
  async create(): Promise<void> {
    const emailAddress = String(this.params.get("email_address") ?? "");
    let user = await User.findBy({ email_address: emailAddress.trim().toLowerCase() });
    user ??= await User.create({ email_address: emailAddress });
    if (user.isPersisted()) {
      await MagicLinksMailer.signIn(user).deliverLater();
      await this.redirectTo(this.sentSessionPath({ email_address: user.email_address }));
    } else {
      await this.redirectTo(this.newSessionPath(), { alert: "Enter a valid email address." });
    }
  }

  async sent(): Promise<void> {}

  async destroy(): Promise<void> {
    await this.terminateSession();
    await this.redirectTo(this.newSessionPath(), { status: ":see_other" });
  }
}
