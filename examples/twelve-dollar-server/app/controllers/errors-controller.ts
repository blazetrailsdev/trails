import { ApplicationController } from "./application-controller.ts";

export class ErrorsController extends ApplicationController {
  static {
    this.allowUnauthenticatedAccess();
  }

  async notFound(): Promise<void> {
    await this.renderError("not found", ":not_found");
  }
}
