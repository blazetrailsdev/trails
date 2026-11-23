import { ApplicationController } from "./application-controller.ts";
import { Post } from "../models/post.ts";
export class PostsController extends ApplicationController {
  declare post: Post;
  static {
    this.beforeAction("setPost", { only: ["show", "publish"] });
  }
  async show(): Promise<void> {
    await this.freshWhen(this.post);
  }
  async create(): Promise<void> {
    const post = await Post.create(this.postParams());
    await this.redirectTo(post, { notice: "Post published." });
  }
  async publish(): Promise<void> {
    await this.post.update({ status: "published" });
    await this.redirectTo(this.post);
  }
  private postParams() {
    return this.params.expect({ post: ["title", "body", "coverImage"] });
  }
  private async setPost(): Promise<void> {
    this.post = await Post.find(this.params.expect("id"));
  }
}
