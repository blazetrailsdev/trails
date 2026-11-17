import { ActionController } from "@blazetrails/actionpack";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class ApplicationController extends ActionController.Base {
  static {
    this.protectFromForgery();
  }
}
constSet(TopLevel, "ApplicationController", ApplicationController);
