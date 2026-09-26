import { ActionController, controllerConstants } from "@blazetrails/actionpack";

export class WelcomeController extends ActionController.Base {
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
