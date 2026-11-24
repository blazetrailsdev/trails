import type { Parameters } from "@blazetrails/actionpack";
import { ApplicationController } from "../application-controller.ts";
import { Current } from "../../models/current.ts";
import type { Account } from "../../models/account.ts";

export class CustomStylesController extends ApplicationController {
  declare account: Account;

  static {
    this.beforeAction(":ensureCanAdminister", ":setAccount");
  }

  async edit(): Promise<void> {}

  async update(): Promise<void> {
    await this.account.updateBang(this.accountParams());
    await this.redirectTo(this.editAccountCustomStylesUrl());
  }

  private async setAccount(): Promise<void> {
    this.account = (await Current.account())!;
  }

  private accountParams(): Parameters {
    return this.params.require("account").permit("custom_styles");
  }
}
