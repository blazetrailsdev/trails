import { attrInternal, delegate } from "@blazetrails/activesupport";
import { basicObjRespondTo, rbObjRespondTo } from "@blazetrails/ruby-compat";

export interface ControllerHelperHost {
  _controller: ControllerLike | null;
  _request: unknown;
  _config: unknown;
  _defaultFormBuilder: unknown;
}

interface ControllerLike {
  request?: unknown;
  config?(): { inheritableCopy(): unknown };
  defaultFormBuilder?(): unknown;
  logger?: unknown;
  [key: string]: unknown;
}

export const CONTROLLER_DELEGATES = [
  "requestForgeryProtectionToken",
  "params",
  "session",
  "cookies",
  "response",
  "headers",
  "flash",
  "actionName",
  "controllerName",
  "controllerPath",
] as const;

export function assignController(
  this: ControllerHelperHost,
  controller: ControllerLike | null,
): void {
  this._controller = controller;
  if (controller) {
    if (rbObjRespondTo(controller, "request")) this._request = controller.request;
    if (rbObjRespondTo(controller, "config")) this._config = controller.config!().inheritableCopy();
    if (rbObjRespondTo(controller, "defaultFormBuilder"))
      this._defaultFormBuilder = controller.defaultFormBuilder!();
  } else {
    this._request ??= null;
    this._config ??= null;
    this._defaultFormBuilder ??= null;
  }
}

export function logger(this: ControllerHelperHost): unknown {
  const controller = this._controller;
  return controller && rbObjRespondTo(controller, "logger") ? controller.logger : undefined;
}

export function isRespondTo(
  this: ControllerHelperHost,
  methodName: string,
  includePrivate: boolean = false,
): boolean {
  if ((CONTROLLER_DELEGATES as readonly string[]).includes(methodName))
    return rbObjRespondTo(this._controller, methodName);
  return basicObjRespondTo(this, methodName, !includePrivate);
}

export class ControllerHelper {}

attrInternal.call(ControllerHelper.prototype, "controller", "request");

delegate.call(
  ControllerHelper.prototype,
  "requestForgeryProtectionToken",
  "params",
  "session",
  "cookies",
  "response",
  "headers",
  "flash",
  "actionName",
  "controllerName",
  "controllerPath",
  { to: "controller" },
);

Object.assign(ControllerHelper.prototype, { assignController, logger, isRespondTo });
