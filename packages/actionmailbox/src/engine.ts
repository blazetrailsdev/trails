import {
  OrderedOptions,
  InheritableOptions,
  days,
  TopLevel,
  type Duration,
  type Logger,
} from "@blazetrails/activesupport";
import "@blazetrails/trailties/trailties/action-controller";
import "@blazetrails/trailties/trailties/active-job";
import "@blazetrails/trailties/trailties/active-record";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import "@blazetrails/activestorage/engine";
import { File } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "./action-mailbox.js";
import "./deprecator.js";

export interface ActionMailboxConfig extends OrderedOptions {
  logger?: Logger | null;
  incinerate?: boolean | null;
  incinerateAfter?: Duration | null;
  queues?: InheritableOptions & { incineration?: string | null; routing?: string | null };
  ingress?: string | null;
  storageService?: string | null;
}

declare module "@blazetrails/trailties/trailtie/configuration" {
  interface Configuration {
    actionMailbox: ActionMailboxConfig;
  }
}

declare module "@blazetrails/ruby-compat" {
  interface TrailsConfiguration {
    actionMailbox: ActionMailboxConfig;
  }
}

export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(ActionMailbox);
    this.config.eagerLoadNamespaces.push(ActionMailbox);

    this.config.paths().add("config/routes.ts", {
      with: File.join(import.meta.dirname, "config", `routes${File.extname(import.meta.filename)}`),
    });

    this.config.paths().add("db/migrate", {
      with: File.join(import.meta.dirname, "db", "migrate"),
    });

    this.config.paths().add("lib/tasks", {
      with: File.join(import.meta.dirname, "tasks"),
      glob: `*${File.extname(import.meta.filename)}`,
    });

    this.config.set("actionMailbox", new OrderedOptions());
    this.config.actionMailbox.incinerate = true;
    this.config.actionMailbox.incinerateAfter = days(30);

    this.config.actionMailbox.queues = new InheritableOptions({
      incineration: "action_mailbox_incineration",
      routing: "action_mailbox_routing",
    });

    this.config.actionMailbox.storageService = null;

    this.initializer("action_mailbox.deprecator", { before: "load_environment_config" }, (app) => {
      app.deprecators.set("actionMailbox", ActionMailbox.deprecator());
    });

    this.initializer("action_mailbox.config", () => {
      this.config.afterInitialize((app) => {
        ActionMailbox.logger = app.config.actionMailbox.logger || TopLevel.Trails!.logger!;
        ActionMailbox.incinerate =
          app.config.actionMailbox.incinerate == null ? true : app.config.actionMailbox.incinerate;
        ActionMailbox.incinerateAfter = app.config.actionMailbox.incinerateAfter || days(30);
        ActionMailbox.queues = app.config.actionMailbox.queues || {};
        ActionMailbox.ingress = app.config.actionMailbox.ingress ?? null;
        ActionMailbox.storageService = app.config.actionMailbox.storageService ?? null;
      });
    });
  }
}
