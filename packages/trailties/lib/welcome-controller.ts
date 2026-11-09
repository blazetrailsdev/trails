import { ApplicationController } from "./application-controller.js";

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
