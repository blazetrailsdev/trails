import { ApplicationController } from "./application-controller.js";
import { Hashtag } from "../models/hashtag.js";

export class HashtagsController extends ApplicationController {
  async show(): Promise<void> {
    const name = String(this.params.get("name")).toLowerCase();
    const hashtag = await Hashtag.findBy({ name });
    if (!hashtag) return this.notFound();

    this.render({
      action: "show",
      locals: {
        ...(await this.layoutLocals()),
        hashtag,
        tweets: await hashtag.tweets.recent().includes("user", "hashtags"),
      },
    });
  }

  private notFound(): void {
    this.render({ plain: "No such hashtag", status: 404 });
  }
}
