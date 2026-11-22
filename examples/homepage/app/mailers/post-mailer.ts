import type { MessageDelivery } from "@blazetrails/actionmailer";
import { ApplicationMailer } from "./application-mailer.ts";
import type { Post } from "../models/post.ts";
export class PostMailer extends ApplicationMailer {
  declare static published: (post: Post) => MessageDelivery;
  declare post: Post;
  async published(post: Post): Promise<void> {
    this.post = post;
    const author = await post.author;
    await this.mail({ to: author.email, subject: `New post: ${post.title}` });
  }
}
