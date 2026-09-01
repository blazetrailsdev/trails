import { ActionController } from "@blazetrails/actionpack";

export class PostsController extends ActionController.Base {
  async index(): Promise<void> {
    this.render({ json: { posts: [] } });
  }

  async show(): Promise<void> {
    this.render({ template: "posts/show", locals: { title: "Hello from TSE" } });
  }

  async boom(): Promise<void> {
    throw new Error("kaboom");
  }
}
