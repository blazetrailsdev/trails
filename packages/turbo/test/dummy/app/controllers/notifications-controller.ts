import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";

export class NotificationsController extends ApplicationController {}
constSet(TopLevel, "NotificationsController", NotificationsController);
