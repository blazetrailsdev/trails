import { ApplicationController } from "./application-controller.js";
import { Like } from "../models/like.js";
import { Tweet } from "../models/tweet.js";

export class LikesController extends ApplicationController {
  static {
    this.beforeAction((c) => (c as LikesController).requireLogin());
  }

  async create(): Promise<void> {
    const me = (await this.currentUser())!;
    const tweet = await this.tweet();
    if (!tweet) return this.notFound();

    const existing = await Like.findBy({ user_id: me.id, tweet_id: tweet.id });
    if (!existing) await Like.createBang({ user_id: me.id, tweet_id: tweet.id });

    this.redirectTo(this.backTo());
  }

  async destroy(): Promise<void> {
    const me = (await this.currentUser())!;
    const tweet = await this.tweet();
    if (!tweet) return this.notFound();

    const like = await Like.findBy({ user_id: me.id, tweet_id: tweet.id });
    if (like) await like.destroy();

    this.redirectTo(this.backTo());
  }

  private async tweet(): Promise<Tweet | null> {
    return Tweet.findBy({ id: Number(this.params.get("tweet_id")) });
  }

  /** Rails: `redirect_back fallback_location: root_path`. */
  private backTo(): string {
    const referer = this.request?.getHeader?.("HTTP_REFERER");
    return typeof referer === "string" && referer !== "" ? referer : "/";
  }

  private notFound(): void {
    this.render({ plain: "No such tweet", status: 404 });
  }
}
