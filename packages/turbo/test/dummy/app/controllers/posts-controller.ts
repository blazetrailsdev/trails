import { TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    PostsController?: typeof PostsController;
  }
}

export class PostsController extends ApplicationController {}
TopLevel.PostsController = PostsController;
