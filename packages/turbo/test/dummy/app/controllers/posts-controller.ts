import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";

export class PostsController extends ApplicationController {}
constSet(TopLevel, "PostsController", PostsController);
