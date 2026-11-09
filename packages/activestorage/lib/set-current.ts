import type { ActionController } from "@blazetrails/actionpack";
import { Concern, extend } from "@blazetrails/activesupport";
import { Current } from "./current.js";

type ControllerClass = typeof ActionController.Base;

export const SetCurrent = {};
extend(SetCurrent, Concern);
(
  SetCurrent as unknown as { included(base: null, block: (this: ControllerClass) => void): void }
).included(null, function (this: ControllerClass) {
  this.beforeAction(function (this: InstanceType<ControllerClass>) {
    const request = this.request;
    Current.urlOptions = { protocol: request.protocol, host: request.host, port: request.port };
  });
});
