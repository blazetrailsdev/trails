import { ApplicationController } from "./application-controller.js";
import { Post } from "../models/post.js";

export class PostsController extends ApplicationController {
  async index(): Promise<void> {
    await this.render({ json: { posts: [] } });
  }

  async show(): Promise<void> {
    await this.render({ template: "posts/show", locals: { title: "Hello from TSE" } });
  }

  async link(): Promise<void> {
    await this.render({ json: { href: (this as unknown as { postsPath(): string }).postsPath() } });
  }

  async url(): Promise<void> {
    await this.render({ json: { href: (this as unknown as { postsUrl(): string }).postsUrl() } });
  }

  async canonical(): Promise<void> {
    await this.render({ json: { href: this.urlFor({ controller: "posts", action: "index" }) } });
  }

  async create(): Promise<void> {
    const post = Post.new(this.postParams());
    await post.save();
    await this.render({ json: { title: post.readAttribute("title") }, status: ":created" });
  }

  private postParams(): Record<string, unknown> {
    return this.params.expect({ post: ["title"] }) as Record<string, unknown>;
  }

  async boom(): Promise<void> {
    throw new Error("kaboom");
  }
}
