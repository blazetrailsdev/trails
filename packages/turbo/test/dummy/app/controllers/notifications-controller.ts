import { TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    NotificationsController?: typeof NotificationsController;
  }
}

export class NotificationsController extends ApplicationController {
  async create(): Promise<void> {
    await this.respondTo((format) => {
      format.turboStream(() => this.render("new"));
    });
  }
}
TopLevel.NotificationsController = NotificationsController;
