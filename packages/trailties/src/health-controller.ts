import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { ActionController, controllerConstants } from "@blazetrails/actionpack";

export class HealthController extends ActionController.Base {
  static override controllerPath(): string {
    return "rails/health";
  }

  async show(): Promise<void> {
    await this.renderUp();
  }

  /** @internal */
  async renderUp(): Promise<void> {
    await this.render({ html: this.htmlStatus("green") });
  }

  /** @internal */
  async renderDown(): Promise<void> {
    await this.render({ html: this.htmlStatus("red"), status: 500 });
  }

  /** @internal */
  htmlStatus(color: string): SafeBuffer {
    return htmlSafe(`<!DOCTYPE html><html><body style="background-color: ${color}"></body></html>`);
  }
}

HealthController.rescueFrom(Error, function (this: HealthController) {
  return this.renderDown();
});

controllerConstants.set("rails/health", HealthController);
