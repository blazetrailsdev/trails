import { TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    NotificationsController?: typeof NotificationsController;
  }
}

export class NotificationsController extends ApplicationController {}
TopLevel.NotificationsController = NotificationsController;
