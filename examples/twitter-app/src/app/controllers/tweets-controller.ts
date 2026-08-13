import type { Parameters as StrongParameters } from "@blazetrails/actionpack";
import { ApplicationController } from "./application-controller.js";
import { Tweet } from "../models/tweet.js";

export class TweetsController extends ApplicationController {
  static {
    this.beforeAction((c) => (c as TweetsController).requireLogin(), {
      only: ["new", "create", "destroy"],
    });
  }

  /** The home timeline: your own tweets plus everyone you follow. */
  async index(): Promise<void> {
    const user = await this.currentUser();
    let tweets;

    if (user) {
      const followeeIds = (await user.following).map((u) => u.id);
      // A scope only type-checks at the head of a chain, so the rest of the
      // conditions are spelled out — see the scope-typing story in the README.
      tweets = await Tweet.roots()
        .where({ user_id: [user.id, ...followeeIds] })
        .order({ created_at: "desc" })
        .includes("user", "hashtags")
        .limit(50);
    } else {
      // Signed out: show the public firehose so the root path is useful.
      tweets = await Tweet.roots()
        .order({ created_at: "desc" })
        .includes("user", "hashtags")
        .limit(50);
    }

    this.render({ action: "index", locals: { ...(await this.layoutLocals()), tweets } });
  }

  async show(): Promise<void> {
    const tweet = await Tweet.findBy({ id: Number(this.params.get("id")) });
    if (!tweet) return this.notFound();

    this.render({
      action: "show",
      locals: {
        ...(await this.layoutLocals()),
        tweet,
        author: await tweet.user,
        replies: await tweet.replies.recent().includes("user", "hashtags"),
        likers: await tweet.likers.limit(10),
      },
    });
  }

  async new(): Promise<void> {
    this.render({ action: "new", locals: await this.layoutLocals() });
  }

  async create(): Promise<void> {
    const user = (await this.currentUser())!;
    const tweet = await user.tweets.build(this.tweetParams());

    if (await tweet.save()) {
      this.setFlash("notice", tweet.reply_to_id ? "Reply posted." : "Tweet posted.");
      this.redirectTo(tweet.reply_to_id ? `/tweets/${tweet.reply_to_id}` : "/");
    } else {
      this.setFlash("alert", "Your tweet can't be blank.");
      this.redirectTo("/tweets/new");
    }
  }

  async destroy(): Promise<void> {
    const user = (await this.currentUser())!;
    const tweet = await Tweet.findBy({ id: Number(this.params.get("id")) });
    if (!tweet) return this.notFound();

    if (tweet.user_id !== user.id) {
      this.setFlash("alert", "You can only delete your own tweets.");
      return this.redirectTo("/");
    }

    await tweet.destroy();
    this.setFlash("notice", "Tweet deleted.");
    this.redirectTo("/");
  }

  /** Rails: `params.require(:tweet).permit(:body, :reply_to_id)`. */
  private tweetParams(): Record<string, unknown> {
    // `require` is typed `unknown` because Rails' returns either a nested
    // Parameters or a scalar; a nested key always yields Parameters.
    const tweet = this.params.require("tweet") as StrongParameters;
    return tweet.permit("body", "reply_to_id").toHash();
  }

  private notFound(): void {
    this.render({ plain: "Not found", status: 404 });
  }
}
