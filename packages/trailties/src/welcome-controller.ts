import { Rails } from "./namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";

export class WelcomeController extends ApplicationController {
  static override controllerPath(): string {
    return "rails/welcome";
  }

  static {
    this.layout(false);
  }

  index(): void {}
}

WelcomeController.skipBeforeAction("verifyAuthenticityToken", { raise: false });

constSet(Rails, "WelcomeController", WelcomeController);
