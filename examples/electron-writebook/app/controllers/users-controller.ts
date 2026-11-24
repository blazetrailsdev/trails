import type { Parameters } from "@blazetrails/actionpack";
import { presenceIn } from "@blazetrails/activesupport";
import { RecordNotUnique } from "@blazetrails/activerecord";
import { ApplicationController } from "./application-controller.ts";
import { Current } from "../models/current.ts";
import { User } from "../models/user.ts";

export class UsersController extends ApplicationController {
  declare users: User[];
  declare user: User;

  static {
    this.requireUnauthenticatedAccess({ only: ["new", "create"] });

    this.beforeAction(":verifyJoinCode", { only: ["new", "create"] });
    this.beforeAction(":ensureCanAdminister", { only: ["update", "destroy"] });
    this.beforeAction(":setUser", { only: ["update", "destroy"] });
  }

  async index(): Promise<void> {
    this.users = await User.active().toArray();
  }

  async new(): Promise<void> {
    this.user = new User();
  }

  async create(): Promise<void> {
    try {
      this.user = (await User.createBang(this.userParams())) as User;
      await this.startNewSessionFor(this.user);
      await this.redirectTo(this.rootUrl());
    } catch (error) {
      if (!(error instanceof RecordNotUnique)) throw error;
      await this.redirectTo(this.newSessionUrl({ email_address: this.userParams().email_address }));
    }
  }

  async update(): Promise<void> {
    await this.user.update(this.roleParams());
    await this.redirectTo(this.usersUrl());
  }

  async destroy(): Promise<void> {
    await this.user.deactivate();
    await this.redirectTo(this.usersUrl());
  }

  private roleParams(): Record<string, unknown> {
    const role = (this.params.require("user") as { get(k: string): unknown }).get("role");
    return { role: presenceIn(role, ["member", "administrator"]) ?? "member" };
  }

  private async setUser(): Promise<void> {
    this.user = await User.active().find(this.params.get("id"));
  }

  private userParams(): Parameters {
    return this.params.require("user").permit("name", "email_address", "password");
  }

  private async verifyJoinCode(): Promise<void> {
    if ((await Current.account())?.join_code !== this.params.get("join_code"))
      await this.head(":not_found");
  }
}
