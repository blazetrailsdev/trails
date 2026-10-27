import type { PostgreSQL } from "./subscription-adapter/postgresql.js";
import type { Redis } from "./subscription-adapter/redis.js";
import { Autoload, extend, type Extended, TopLevel } from "@blazetrails/activesupport";
import type { INTERNAL, server } from "./action-cable.js";
import type { Base as ChannelBase } from "./channel/base.js";
import type { Base as ConnectionBase } from "./connection/base.js";
import type { TestCase } from "./test-case.js";
import type {
  TestCase as ChannelTestCase,
  NonInferrableChannelError,
  ChannelStub,
  ConnectionStub,
} from "./channel/test-case.js";
import type {
  TestCase as ConnectionTestCase,
  NonInferrableConnectionError,
  Assertions,
  TestCookies,
  TestCookieJar,
  TestRequest,
  TestConnection,
} from "./connection/test-case.js";
import type { TestHelper } from "./test-helper.js";
import { rbDeclareIvar, registerConstant } from "@blazetrails/ruby-compat";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

export const Server = { name: "ActionCable::Server" } as AutoloadModule & {
  Base: new () => unknown;
};
extend(Server, Autoload);

export const Connection = { name: "ActionCable::Connection" } as AutoloadModule & {
  Base: typeof ConnectionBase;
  TestCase?: typeof ConnectionTestCase;
  NonInferrableConnectionError?: typeof NonInferrableConnectionError;
  Assertions?: typeof Assertions;
  TestCookies?: typeof TestCookies;
  TestCookieJar?: typeof TestCookieJar;
  TestRequest?: typeof TestRequest;
  TestConnection?: typeof TestConnection;
};
extend(Connection, Autoload);

export const Channel = { name: "ActionCable::Channel" } as AutoloadModule & {
  Base: typeof ChannelBase;
  TestCase?: typeof ChannelTestCase;
  NonInferrableChannelError?: typeof NonInferrableChannelError;
  ChannelStub?: typeof ChannelStub;
  ConnectionStub?: typeof ConnectionStub;
};
extend(Channel, Autoload);

export const SubscriptionAdapter = {
  name: "ActionCable::SubscriptionAdapter",
  loadPath: {},
} as AutoloadModule & { PostgreSQL?: typeof PostgreSQL; Redis?: typeof Redis };
extend(SubscriptionAdapter, Autoload);

export const Helpers = { name: "ActionCable::Helpers" } as AutoloadModule;
extend(Helpers, Autoload);

export const ActionCable = {
  name: "ActionCable",
  Server,
  Connection,
  Channel,
  SubscriptionAdapter,
  Helpers,
} as AutoloadModule & {
  INTERNAL: typeof INTERNAL;
  server: typeof server;
  Server: typeof Server;
  Connection: typeof Connection;
  Channel: typeof Channel;
  SubscriptionAdapter: typeof SubscriptionAdapter;
  Helpers: typeof Helpers;
  TestCase?: typeof TestCase;
  TestHelper?: typeof TestHelper;
  Engine?: unknown;
  _server?: unknown;
};
registerConstant("ActionCable", ActionCable);
extend(ActionCable, Autoload);
rbDeclareIvar({ prototype: ActionCable }, "@server", "_server");

TopLevel.ActionCable = ActionCable;
