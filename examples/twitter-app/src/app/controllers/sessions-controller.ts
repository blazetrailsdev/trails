import { ApplicationController } from "./application-controller.js";
import { User } from "../models/user.js";
import { digestPassword } from "./users-controller.js";

export class SessionsController extends ApplicationController {
  async new(): Promise<void> {
    this.render({ action: "new", locals: await this.layoutLocals() });
  }

  async create(): Promise<void> {
    const params = this.params.permit("handle", "password").toHash();
    const user = await User.findBy({ handle: String(params.handle ?? "") });

    if (user && user.password_digest === digestPassword(String(params.password ?? ""))) {
      this.logIn(user);
      this.setFlash("notice", `Signed in as @${user.handle}.`);
      this.redirectTo("/");
    } else {
      this.setFlash("alert", "That handle and password don't match.");
      this.redirectTo("/login");
    }
  }

  async destroy(): Promise<void> {
    this.logOut();
    this.setFlash("notice", "Signed out.");
    this.redirectTo("/");
  }
}
