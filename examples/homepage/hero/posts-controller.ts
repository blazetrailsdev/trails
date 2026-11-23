import { ApplicationController } from "./application-controller.ts";
import type { Post } from "../models/post.ts";

export class PostsController extends ApplicationController {
  declare post: Post;

  async publish(): Promise<void> {
    await this.post.udpate({ status: "published" });
    await this.redirectTo(this.post);
  }
}
