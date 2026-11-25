import { ApplicationController } from "./application-controller.ts";
import { User } from "../models/user.ts";

export class UsersController extends ApplicationController {
  async create(): Promise<void> {
    const user = await User.createBang(this.userParams());
    await this.render({ json: user.attributes, status: ":created" });
  }

  async show(): Promise<void> {
    const user = await User.findByBang({ handle: this.params.get("handle") });
    await this.render({
      json: {
        ...user.attributes,
        followers: await user.followers.count(),
        following: await user.following.count(),
      },
    });
  }

  private userParams() {
    return this.params.permit("handle", "display_name", "bio");
  }
}
