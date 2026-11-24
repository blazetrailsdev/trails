import type { Parameters } from "@blazetrails/actionpack";
import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationController } from "../application-controller.ts";
import { UserScoped } from "../concerns/user-scoped.ts";
import type { User } from "../../models/user.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface ProfilesController extends Included<typeof UserScoped> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProfilesController extends ApplicationController {
  declare user: User;

  static {
    include(this, UserScoped);

    this.beforeAction(":ensureCurrentUser", { only: ["edit", "update"] });
  }

  async show(): Promise<void> {}

  async edit(): Promise<void> {}

  async update(): Promise<void> {
    await this.user.updateBang(this.userParams());
    await this.redirectTo(this.usersUrl());
  }

  private userParams(): Parameters {
    return this.params.require("user").permit("name", "email_address", "password");
  }
}
