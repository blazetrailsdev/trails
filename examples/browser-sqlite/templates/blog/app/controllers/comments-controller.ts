import { Post } from "../models/post.ts";
import type { Comment } from "../models/comment.ts";
import { ApplicationController } from "./application-controller.ts";

export class CommentsController extends ApplicationController {
  static {
    this.beforeAction(":_setPost");
  }

  declare post: Post;
  declare comment: Comment;

  async create(): Promise<void> {
    this.comment = this.post.comments.build(this._commentParams());
    if (await this.comment.save()) {
      await this.redirectTo(this.post, {
        notice: "Thanks for your comment.",
        status: ":see_other",
      });
    } else {
      await this.render("posts/show", { status: ":unprocessable_content" });
    }
  }

  async destroy(): Promise<void> {
    const comment = await this.post.comments.find(this.params.expect("id"));
    await comment.destroy();
    await this.redirectTo(this.post, { notice: "Comment removed.", status: ":see_other" });
  }

  private async _setPost(): Promise<void> {
    this.post = await Post.find(this.params.expect("post_id"));
  }

  private _commentParams() {
    return this.params.expect({ comment: ["author", "body"] });
  }
}
