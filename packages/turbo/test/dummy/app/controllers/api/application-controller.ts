import { ActionController } from "@blazetrails/actionpack";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export const Api: Record<string, unknown> = {};
constSet(TopLevel, "Api", Api);

export class ApplicationController extends ActionController.API {}
constSet(Api, "ApplicationController", ApplicationController);
