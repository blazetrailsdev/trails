import {
  Autoload,
  days,
  extend,
  mattrAccessor,
  type Deprecation,
  type Duration,
  type Extended,
  type Logger,
} from "@blazetrails/activesupport";
import { File, LOAD_PATH, TopLevel, constSet } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import type { BaseController } from "./base-controller.js";
import type { Callbacks } from "./callbacks.js";
import type { InboundEmail } from "./inbound-email.js";
import type { InboundEmailsController as RelayInboundEmailsController } from "./ingresses/relay/inbound-emails-controller.js";
import type { Record as ActionMailboxRecord } from "./record.js";
import type { Relayer } from "./relayer.js";
import type { Router } from "./router.js";
import type { Routing } from "./routing.js";
import type { RoutingJob } from "./routing-job.js";
import type { TestCase } from "./test-case.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {};

const LIB = File.expandPath(decodeURIComponent(new URL(".", import.meta.url).pathname));
if (!LOAD_PATH.includes(LIB)) LOAD_PATH.push(LIB);

export const ActionMailbox = { name: "ActionMailbox", loadPath } as AutoloadModule & {
  Base: typeof Base;
  BaseController: typeof BaseController;
  Callbacks: typeof Callbacks;
  Ingresses: { Relay: { InboundEmailsController?: typeof RelayInboundEmailsController } };
  InboundEmail: typeof InboundEmail;
  Record: typeof ActionMailboxRecord;
  Relayer: typeof Relayer;
  Router: typeof Router;
  Routing: typeof Routing;
  RoutingJob: typeof RoutingJob;
  TestCase: typeof TestCase;
  deprecator(): Deprecation;
  ingress: string | null;
  logger: Logger | null;
  incinerate: boolean;
  incinerateAfter: Duration;
  queues: { incineration?: unknown; routing?: unknown };
  storageService: string | null;
};
extend(ActionMailbox, Autoload);
constSet(TopLevel, "ActionMailbox", ActionMailbox);

ActionMailbox.Ingresses = { Relay: {} };

ActionMailbox.autoload("Base");
ActionMailbox.autoload("Router");
ActionMailbox.autoload("TestCase");

mattrAccessor.call(ActionMailbox, "ingress");
mattrAccessor.call(ActionMailbox, "logger");
mattrAccessor.call(ActionMailbox, "incinerate", { default: true });
mattrAccessor.call(ActionMailbox, "incinerateAfter", { default: days(30) });
mattrAccessor.call(ActionMailbox, "queues", { default: {} });
mattrAccessor.call(ActionMailbox, "storageService");
