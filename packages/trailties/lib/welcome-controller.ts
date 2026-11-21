import "./constants.welcome-controller.generated.js";
import { ApplicationController } from "./application-controller.js";
import { Trails } from "./trails.js";

export class WelcomeController extends ApplicationController {
  static override controllerPath(): string {
    return "trails/welcome";
  }

  static {
    this.skipForgeryProtection();
    this.layout(false);
  }

  index(): void {}
}

Trails.WelcomeController = WelcomeController;
