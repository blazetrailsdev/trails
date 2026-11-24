import { ApplicationController } from "../application-controller.ts";
import { Tweet } from "../../models/tweet.ts";
import { User } from "../../models/user.ts";

export class TimelinesController extends ApplicationController {
  /** The home timeline: tweets from everyone this user follows, newest first. */
  async show(): Promise<void> {
    const user = await User.findByBang({ handle: this.params.get("user_handle") });
    const followeeIds = (await user.following).map((u) => u.id);
    const tweets = await Tweet.where({ user_id: followeeIds })
      .includes("author")
      .recent()
      .limit(50);
    const json = [];
    for (const t of tweets) {
      json.push({
        id: t.id,
        body: t.body,
        author: (await t.author)?.handle,
        created_at: t.created_at,
      });
    }
    await this.render({ json });
  }
}
