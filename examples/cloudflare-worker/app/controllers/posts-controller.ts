import { ApplicationController } from "./application-controller.ts";
import { Post } from "../models/post.ts";

export class PostsController extends ApplicationController {
  declare posts: Post[];
  async index(): Promise<void> {
    this.posts = await Post.order({ id: "desc" }).limit(5).toArray();
  }
  async create(): Promise<void> {
    const attributes = this.params.expect({ post: ["title"] });
    await Post.transaction(() => Post.create(attributes));
    await this.redirectTo("/posts", { status: 303 });
  }
  async health(): Promise<void> {
    await this.render({ plain: "ok" });
  }
}
