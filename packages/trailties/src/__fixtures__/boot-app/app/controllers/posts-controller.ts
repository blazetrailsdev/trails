import { ActionController } from "@blazetrails/actionpack";

export class PostsController extends ActionController.Base {
  async index(): Promise<void> {
    this.render({ json: { posts: [] } });
  }

  async show(): Promise<void> {
    this.render({ template: "posts/show", locals: { title: "Hello from TSE" } });
  }

  async link(): Promise<void> {
    this.render({ json: { href: (this as unknown as { postsPath(): string }).postsPath() } });
  }

  async boom(): Promise<void> {
    throw new Error("kaboom");
  }
}
