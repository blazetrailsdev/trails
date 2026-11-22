import { Base } from "@blazetrails/activejob";
import { PostMailer } from "../mailers/post-mailer.ts";
import type { Post } from "../models/post.ts";
export class NotifyFollowersJob extends Base {
  async perform(post: Post): Promise<void> {
    await PostMailer.published(post).deliverLater();
  }
}
