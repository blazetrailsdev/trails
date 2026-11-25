import type { Parameters } from "@blazetrails/actionpack";
import { RecordNotUnique } from "@blazetrails/activerecord";
import { ApplicationController } from "./application-controller.ts";
import { FirstRun } from "../models/first-run.ts";
import { User } from "../models/user.ts";

export class FirstRunsController extends ApplicationController {
  declare user: User;

  static {
    this.allowUnauthenticatedAccess();

    this.beforeAction(":preventRunningAfterSetup");
  }

  async show(): Promise<void> {
    this.user = new User();
  }

  async create(): Promise<void> {
    try {
      const user = await FirstRun.createBang(this.userParams());
      await this.startNewSessionFor(user);

      await this.redirectTo(this.rootUrl());
    } catch (error) {
      if (!(error instanceof RecordNotUnique)) throw error;
      await this.redirectTo(this.rootUrl());
    }
  }

  private async preventRunningAfterSetup(): Promise<void> {
    if (await User.isAny()) await this.redirectTo(this.rootUrl());
  }

  private userParams(): Parameters {
    return (this.params.require("user") as Parameters).permit("name", "email_address", "password");
  }
}
