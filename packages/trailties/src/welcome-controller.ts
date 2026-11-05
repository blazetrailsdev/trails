import { ApplicationController } from "./application-controller.js";

export class WelcomeController extends ApplicationController {
  static override controllerPath(): string {
    return "trails/welcome";
  }

  static {
    this.layout(false);
  }

  index(): void {}
}

WelcomeController.skipBeforeAction(":verifyAuthenticityToken", { raise: false });
