import { ApplicationController } from "../application-controller.ts";
import { User } from "../../models/user.ts";

export class TweetsController extends ApplicationController {
  async index(): Promise<void> {
    const user = await User.findByBang({ handle: this.params.get("user_handle") });
    const tweets = await user.tweets.order({ created_at: "desc" });
    await this.render({ json: tweets.map((t) => t.attributes) });
  }

  async create(): Promise<void> {
    const user = await User.findByBang({ handle: this.params.get("user_handle") });
    const tweet = await user.tweets.createBang(this.params.permit("body"));
    await this.render({ json: tweet.attributes, status: ":created" });
  }
}
