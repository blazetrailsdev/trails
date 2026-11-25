import { ApplicationController } from "../application-controller.ts";
import { Follow } from "../../models/follow.ts";
import { User } from "../../models/user.ts";

export class FollowsController extends ApplicationController {
  async create(): Promise<void> {
    const follower = await User.findByBang({ handle: this.params.get("user_handle") });
    const followee = await User.findByBang({ handle: this.params.get("target") });
    const follow = await Follow.createBang({ follower_id: follower.id, followee_id: followee.id });
    await this.render({ json: follow.attributes, status: ":created" });
  }
}
