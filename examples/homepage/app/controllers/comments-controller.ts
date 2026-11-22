import { ApplicationController } from "./application-controller.ts";
import { Comment } from "../models/comment.ts";
import { Post } from "../models/post.ts";

export class CommentsController extends ApplicationController {
  async create(): Promise<void> {
    const post = await Post.find(this.params.expect("post_id"));
    await Comment.create({ ...this.params.expect({ comment: ["body"] }), post });
    await this.redirectTo(post);
  }

  async destroy(): Promise<void> {
    const comment = await Comment.find(this.params.expect("id"));
    await comment.destroy();
    await this.redirectTo("/posts", { status: 303 });
  }
}
