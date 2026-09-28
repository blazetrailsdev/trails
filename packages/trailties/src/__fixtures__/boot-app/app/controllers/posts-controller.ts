import { ApplicationController } from "./application-controller.js";

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

  async boom(): Promise<void> {
    throw new Error("kaboom");
  }
}
