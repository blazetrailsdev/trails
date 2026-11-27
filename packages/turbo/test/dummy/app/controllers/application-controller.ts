import { ActionController } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    ApplicationController?: typeof ApplicationController;
  }
}

export class ApplicationController extends ActionController.Base {
  static {
    this.protectFromForgery();
  }
}
TopLevel.ApplicationController = ApplicationController;
