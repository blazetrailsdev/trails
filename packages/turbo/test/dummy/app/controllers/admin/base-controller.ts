import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationController } from "../application-controller.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Admin?: typeof Admin;
  }
}

export const Admin: Record<string, unknown> = {};
constSet(TopLevel, "Admin", Admin);

export class BaseController extends ApplicationController {
  static {
    this.prependViewPath("app/views/admin");
  }
}
Admin.BaseController = BaseController;
