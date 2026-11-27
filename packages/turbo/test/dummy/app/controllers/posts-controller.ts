import { TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    PostsController?: typeof PostsController;
  }
}

export class PostsController extends ApplicationController {
  async create(): Promise<void> {
    await this.respondTo((format) => {
      format.turboStream(() => this.render("new"));
    });
  }
}
TopLevel.PostsController = PostsController;
