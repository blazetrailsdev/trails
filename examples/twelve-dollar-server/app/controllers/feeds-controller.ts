import { ApplicationController } from "./application-controller.ts";
import { Post } from "../models/post.ts";

export class FeedsController extends ApplicationController {
  static {
    this.allowUnauthenticatedAccess();
  }

  async show(): Promise<void> {
    const posts = await Post.withDetails().newestFirst().limit(20);
    await this.render({ json: { posts } });
  }
}
