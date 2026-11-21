import "./constants.health-controller.generated.js";
import { htmlSafe, type SafeBuffer } from "@blazetrails/activesupport";
import { ActionController } from "@blazetrails/actionpack";
import { Trails } from "./trails.js";

export class HealthController extends ActionController.Base {
  static override controllerPath(): string {
    return "trails/health";
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

HealthController.rescueFrom(Error, {
  with: function (this: HealthController) {
    return this.renderDown();
  },
});

Trails.HealthController = HealthController;
