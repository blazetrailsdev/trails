import { ApplicationController } from "./application-controller.js";
import { Follow } from "../models/follow.js";
import { User } from "../models/user.js";

export class FollowsController extends ApplicationController {
  static {
    this.beforeAction((c) => (c as FollowsController).requireLogin());
  }

  async create(): Promise<void> {
    const me = (await this.currentUser())!;
    const target = await this.target();
    if (!target) return this.notFound();

    if (target.id === me.id) {
      this.setFlash("alert", "You can't follow yourself.");
      return this.redirectTo(`/@${target.handle}`);
    }

    const existing = await Follow.findBy({ follower_id: me.id, followee_id: target.id });
    if (!existing) await Follow.createBang({ follower_id: me.id, followee_id: target.id });

    this.setFlash("notice", `You now follow @${target.handle}.`);
    this.redirectTo(`/@${target.handle}`);
  }

  async destroy(): Promise<void> {
    const me = (await this.currentUser())!;
    const target = await this.target();
    if (!target) return this.notFound();

    const follow = await Follow.findBy({ follower_id: me.id, followee_id: target.id });
    if (follow) await follow.destroy();

    this.setFlash("notice", `You no longer follow @${target.handle}.`);
    this.redirectTo(`/@${target.handle}`);
  }

  private async target(): Promise<User | null> {
    return User.findBy({ handle: String(this.params.get("handle")) });
  }

  private notFound(): void {
    this.render({ plain: "No such user", status: 404 });
  }
}
