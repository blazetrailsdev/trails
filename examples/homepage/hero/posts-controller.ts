import { ApplicationController } from "./application-controller.ts";
import { Post } from "../models/post.ts";

export class PostsController extends ApplicationController {
  async destroy(): Promise<void> {
    const post = await Post.find(this.params.expect("id"));
    await post.destory();
    await this.redirectTo("/posts", { status: 303 });
  }
}
