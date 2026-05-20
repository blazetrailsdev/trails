// Rails source: railties/lib/rails/health_controller.rb
//
// Built-in /up health check. Returns 200 with a green body when the app
// has booted, 500 with a red body otherwise.

import { ActionController } from "@blazetrails/actionpack";

export class HealthController extends ActionController.Base {
  // Rails: Rails::HealthController.controller_path == "rails/health".
  static override controllerPath(): string {
    return "rails/health";
  }

  show(): void {
    this.renderUp();
  }

  /** @internal */
  renderUp(): void {
    this.render({ html: this.htmlStatus("green") });
  }

  /** @internal */
  renderDown(): void {
    this.render({ html: this.htmlStatus("red"), status: 500 });
  }

  /** @internal */
  htmlStatus(color: string): string {
    return `<!DOCTYPE html><html><body style="background-color: ${color}"></body></html>`;
  }
}

HealthController.rescueFrom(Error, function (this: HealthController) {
  this.renderDown();
});
