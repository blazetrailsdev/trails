import { rbModConstSet } from "@blazetrails/ruby-compat";
import { ActionCable } from "./namespaces.js";

export const INTERNAL = {
  messageTypes: {
    welcome: "welcome",
    disconnect: "disconnect",
    ping: "ping",
    confirmation: "confirm_subscription",
    rejection: "reject_subscription",
  },
  disconnectReasons: {
    unauthorized: "unauthorized",
    invalidRequest: "invalid_request",
    serverRestart: "server_restart",
    remote: "remote",
  },
  defaultMountPath: "/cable",
  protocols: Object.freeze(["actioncable-v1-json", "actioncable-unsupported"]),
};
rbModConstSet(ActionCable, "INTERNAL", INTERNAL);

export function server(this: typeof ActionCable): unknown {
  return (this._server ??= new ActionCable.Server.Base());
}
ActionCable.server = server;
