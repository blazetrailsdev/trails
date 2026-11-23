import { ActionController } from "@blazetrails/actionpack";
import { include } from "@blazetrails/ruby-compat";
import { SetCurrent } from "../concerns/active-storage/set-current.js";

export class BaseController extends ActionController.Base {
  static {
    include(this, SetCurrent);

    this.protectFromForgery({ with: "exception" });

    this.etagWithTemplateDigest = false;
  }
}
