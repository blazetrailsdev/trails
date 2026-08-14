import { ActionController } from "@blazetrails/actionpack";

export class PostsController extends ActionController.Base {
  async index(): Promise<void> {
    this.render({ json: { posts: [] } });
  }

  async boom(): Promise<void> {
    throw new Error("kaboom");
  }
}
