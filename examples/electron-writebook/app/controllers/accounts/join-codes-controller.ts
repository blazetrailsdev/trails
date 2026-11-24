import { ApplicationController } from "../application-controller.ts";
import { Current } from "../../models/current.ts";

export class JoinCodesController extends ApplicationController {
  static {
    this.beforeAction(":ensureCanAdminister");
  }

  async create(): Promise<void> {
    await (await Current.account())!.resetJoinCode();
    await this.redirectTo(this.usersUrl());
  }
}
