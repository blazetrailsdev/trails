import { ApplicationJob } from "./application-job.ts";
import { PostMailer } from "../mailers/post-mailer.ts";
import type { Post } from "../models/post.ts";
export class NotifyFollowersJob extends ApplicationJob {
  async perform(post: Post): Promise<void> {
    await PostMailer.published(post).deliverLater();
  }
}
