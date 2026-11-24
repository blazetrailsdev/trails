import { ApplicationController } from "../application-controller.ts";
import { Like } from "../../models/like.ts";
import { Tweet } from "../../models/tweet.ts";
import { User } from "../../models/user.ts";

export class LikesController extends ApplicationController {
  async create(): Promise<void> {
    const tweet = await Tweet.find(this.params.get("tweet_id"));
    const user = await User.findByBang({ handle: this.params.get("handle") });
    const like = await Like.createBang({ user_id: user.id, tweet_id: tweet.id });
    await this.render({
      json: { ...like.attributes, likes: await tweet.likes.count() },
      status: ":created",
    });
  }
}
