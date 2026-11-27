import { ActionController } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/ruby-compat";

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    Api?: typeof Api;
  }
}

export const Api: Record<string, unknown> = {};
TopLevel.Api = Api;

export class ApplicationController extends ActionController.API {}
Api.ApplicationController = ApplicationController;
