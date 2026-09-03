import { ActionController } from "@blazetrails/actionpack";

export class WelcomeController extends ActionController.Base {
  static override controllerPath(): string {
    return "rails/welcome";
  }

  static override layout: string | false = false;

  index(): void {}
}

WelcomeController.skipBeforeAction("verifyAuthenticityToken");
