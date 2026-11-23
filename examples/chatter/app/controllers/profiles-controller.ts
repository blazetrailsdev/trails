import { ApplicationController } from "./application-controller.ts";
import { Current } from "../models/current.ts";
import type { User } from "../models/user.ts";

export class ProfilesController extends ApplicationController {
  declare user: User;

  async edit(): Promise<void> {
    this.user = Current.user!;
  }

  async update(): Promise<void> {
    this.user = Current.user!;
    if (await this.user.update(this.params.expect({ user: ["name", "avatar"] }))) {
      await this.redirectTo(this.rootPath(), { notice: "Profile updated." });
    } else {
      await this.render("edit", { status: ":unprocessable_entity" });
    }
  }
}
