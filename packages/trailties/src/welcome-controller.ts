import { controllerConstants } from "@blazetrails/actionpack";
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

WelcomeController.skipBeforeAction("verifyAuthenticityToken");

controllerConstants.set("rails/welcome", WelcomeController);
