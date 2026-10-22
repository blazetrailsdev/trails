import { Autoload, extend, type Extended, TopLevel } from "@blazetrails/activesupport";
import type { INTERNAL, server } from "./action-cable.js";
import { rbDeclareIvar, rbModConstSet, registerConstant } from "@blazetrails/ruby-compat";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

export const Server = { name: "ActionCable::Server" } as AutoloadModule & {
  Base: new () => unknown;
};
extend(Server, Autoload);

export const Connection = { name: "ActionCable::Connection" } as AutoloadModule;
extend(Connection, Autoload);

export const Channel = { name: "ActionCable::Channel" } as AutoloadModule;
extend(Channel, Autoload);

export const SubscriptionAdapter = {
  name: "ActionCable::SubscriptionAdapter",
  loadPath: {},
} as AutoloadModule;
extend(SubscriptionAdapter, Autoload);

export const Helpers = { name: "ActionCable::Helpers" } as AutoloadModule;
extend(Helpers, Autoload);

export const ActionCable = { name: "ActionCable" } as AutoloadModule & {
  INTERNAL: typeof INTERNAL;
  server: typeof server;
  Server: typeof Server;
  Connection: typeof Connection;
  Channel: typeof Channel;
  SubscriptionAdapter: typeof SubscriptionAdapter;
  Helpers: typeof Helpers;
  Engine?: unknown;
  _server?: unknown;
};
registerConstant("ActionCable", ActionCable);
extend(ActionCable, Autoload);
rbDeclareIvar({ prototype: ActionCable }, "@server", "_server");
rbModConstSet(ActionCable, "Server", Server);
rbModConstSet(ActionCable, "Connection", Connection);
rbModConstSet(ActionCable, "Channel", Channel);
rbModConstSet(ActionCable, "SubscriptionAdapter", SubscriptionAdapter);
rbModConstSet(ActionCable, "Helpers", Helpers);

TopLevel.ActionCable = ActionCable;
