import type { ActionController } from "@blazetrails/actionpack";
import { Concern, extend } from "@blazetrails/activesupport";

type ControllerClass = typeof ActionController.Base;

export const DisableSession = {};
extend(DisableSession, Concern);
(
  DisableSession as unknown as {
    included(base: null, block: (this: ControllerClass) => void): void;
  }
).included(null, function (this: ControllerClass) {
  this.beforeAction(function (this: InstanceType<ControllerClass>) {
    this.request.sessionOptions["skip"] = true;
  });
});
