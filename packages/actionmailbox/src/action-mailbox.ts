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
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import type { InboundEmail } from "./inbound-email.js";
import type { Record as ActionMailboxRecord } from "./record.js";
import type { Relayer } from "./relayer.js";
import type { Router } from "./router.js";
import type { RoutingJob } from "./routing-job.js";
import type { TestCase } from "./test-case.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {};

export const ActionMailbox = { name: "ActionMailbox", loadPath } as AutoloadModule & {
  Base: unknown;
  InboundEmail: typeof InboundEmail;
  Record: typeof ActionMailboxRecord;
  Relayer: typeof Relayer;
  Router: typeof Router;
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

ActionMailbox.autoload("Base");
ActionMailbox.autoload("Router");
ActionMailbox.autoload("TestCase");

mattrAccessor.call(ActionMailbox, "ingress");
mattrAccessor.call(ActionMailbox, "logger");
mattrAccessor.call(ActionMailbox, "incinerate", { default: true });
mattrAccessor.call(ActionMailbox, "incinerateAfter", { default: days(30) });
mattrAccessor.call(ActionMailbox, "queues", { default: {} });
mattrAccessor.call(ActionMailbox, "storageService");
