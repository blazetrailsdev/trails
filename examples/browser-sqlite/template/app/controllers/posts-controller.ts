import { ApplicationController } from "./application-controller.ts";
import { Post } from "../models/post.ts";

export class PostsController extends ApplicationController {
  declare posts: Post[];
  declare post: Post;

  async index(): Promise<void> {
    console.log("Loading posts…");
    this.posts = await Post.order({ id: "desc" }).toArray();
    this.post = new Post();
  }

  async show(): Promise<void> {
    this.post = await Post.find(this.params.get("id"));
  }

  async create(): Promise<void> {
    this.post = new Post(this.params.expect({ post: ["title", "body"] }));
    if (await this.post.save()) {
      console.log(`Created post #${this.post.id}`);
      await this.redirectTo({ action: "index" }, { status: 303 });
    } else {
      this.posts = await Post.order({ id: "desc" }).toArray();
      await this.render("index", { status: 422 });
    }
  }

  async destroy(): Promise<void> {
    const post = await Post.find(this.params.get("id"));
    await post.destroy();
    await this.redirectTo({ action: "index" }, { status: 303 });
  }
}
