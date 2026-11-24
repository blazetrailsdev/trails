import { minutes } from "@blazetrails/activesupport";
import { ApplicationController } from "./application-controller.ts";
import { User } from "../models/user.ts";

export class SessionsController extends ApplicationController {
  static {
    this.allowUnauthenticatedAccess({ only: ["new", "create"] });
    this.rateLimit({
      to: 10,
      within: minutes(3),
      only: "create",
      with: async function (this: SessionsController) {
        await this.renderRejection(":too_many_requests");
      },
    });

    this.beforeAction(":ensureUserExists", { only: "new" });
  }

  async new(): Promise<void> {}

  async create(): Promise<void> {
    const user = await User.active().authenticateBy({
      email_address: this.params.get("email_address"),
      password: this.params.get("password"),
    });
    if (user) {
      await this.startNewSessionFor(user as User);
      await this.redirectTo(this.postAuthenticatingUrl());
    } else {
      await this.renderRejection(":unauthorized");
    }
  }

  async destroy(): Promise<void> {
    await this.terminateCurrentSession();
    await this.redirectTo(this.rootUrl());
  }

  private async ensureUserExists(): Promise<void> {
    if (await User.isNone()) await this.redirectTo(this.firstRunUrl());
  }

  private async renderRejection(status: string): Promise<void> {
    (await this.flash).set("alert", "Too many requests or unauthorized.");
    await this.render("new", { status });
  }
}
