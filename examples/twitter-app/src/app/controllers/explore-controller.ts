import { ApplicationController } from "./application-controller.js";
import { Hashtag } from "../models/hashtag.js";
import { Tweet } from "../models/tweet.js";
import { User } from "../models/user.js";

export class ExploreController extends ApplicationController {
  async index(): Promise<void> {
    const me = await this.currentUser();

    // Trending: join through the HABTM table, count per tag, busiest first.
    const counts = (await Hashtag.joins("tweets")
      .group("hashtags.name")
      .order("COUNT(*) DESC")
      .limit(10)
      .count()) as Map<string, number>;
    const trending = [...counts.entries()].map(([name, count]) => ({ name, count }));

    // Who to follow: everyone this user isn't already following, chattiest first.
    let suggestions: User[];
    if (me) {
      const excluded = [...(await me.following.pluck("id")), me.id];
      suggestions = await User.chatty().where("id NOT IN (?)", excluded).limit(5);
    } else {
      suggestions = await User.chatty().limit(5);
    }

    this.render({
      action: "index",
      locals: {
        ...(await this.layoutLocals()),
        trending,
        suggestions,
        // Most-liked tweets: HAVING over the likes join.
        popular: await Tweet.popular()
          .where("likes_count > 0")
          .includes("user", "hashtags")
          .limit(5),
      },
    });
  }
}
