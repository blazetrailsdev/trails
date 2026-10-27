import {
  ActionCable,
  ActionCableHelper,
  deprecator as actionCableDeprecator,
} from "@blazetrails/actioncable";
import { Worker } from "@blazetrails/actioncable/server/worker";
import type { Base as Server } from "@blazetrails/actioncable/server/base";
import type { Configuration } from "@blazetrails/actioncable/server/configuration";
import type { RackApp } from "@blazetrails/actionpack";
import type { RackEnv } from "@blazetrails/rack";
import {
  OrderedOptions,
  include,
  onLoad,
  safeConstantize,
  TopLevel,
} from "@blazetrails/activesupport";
import { File, Pathname, block, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Engine as BaseEngine } from "../engine.js";
import { HealthController } from "../health-controller.js";

type Options = OrderedOptions & Record<string, unknown>;

export class Engine extends BaseEngine {
  static {
    BaseEngine.register(this, import.meta.dirname);

    this.config.set("actionCable", new OrderedOptions());
    (this.config.get("actionCable") as Options).mountPath = ActionCable.INTERNAL.defaultMountPath;
    (this.config.get("actionCable") as Options).precompileAssets = true;

    this.initializer("action_cable.deprecator", { before: "load_environment_config" }, (app) => {
      app.deprecators.set("actionCable", actionCableDeprecator());
    });

    this.initializer("action_cable.helpers", () => {
      onLoad("action_view", (base: new (...args: never[]) => unknown) => {
        include(base, ActionCableHelper);
      });
    });

    this.initializer("action_cable.logger", () => {
      onLoad("action_cable", function (this: Configuration) {
        this.logger ??= TopLevel.Trails!.logger;
      });
    });

    this.initializer("action_cable.health_check_application", () => {
      onLoad("action_cable", function (this: Configuration) {
        this.healthCheckApplication = (env) =>
          (HealthController.action("show") as RackApp)(env as RackEnv) as never;
      });
    });

    this.initializer("action_cable.asset", () => {
      this.config.afterInitialize((app) => {
        if (
          rbObjRespondTo(app.config, "assets") &&
          (app.config.get("actionCable") as Options).precompileAssets
        ) {
          const assets = app.config.get("assets") as { precompile: string[] };
          assets.precompile = [...assets.precompile, "actioncable.js", "actioncable.esm.js"];
        }
      });
    });

    this.initializer("action_cable.set_configs", async (app) => {
      const options = app.config.get("actionCable") as Options;
      if (TopLevel.Trails!.env["development?"]()) {
        options.allowedRequestOrigins ??= /https?:\/\/localhost:\d+/;
      }

      app.paths().add("config/cable", { with: "config/cable.ts" });

      let hook: Promise<void> | undefined;
      onLoad("action_cable", function (this: Configuration) {
        hook = (async () => {
          const configPath = new Pathname((await app.config.paths().get("config/cable")!.first())!);
          if (await File.isExist(configPath.toString())) {
            this.cable = { ...((await app.configFor(configPath)) as OrderedOptions | null)?.toH() };
            await this.loadPubsubAdapter();
          }

          const previousConnectionClass = this.connectionClass;
          this.connectionClass = () =>
            safeConstantize("ApplicationCable::Connection") ?? previousConnectionClass();
          this.filterParameters = [...this.filterParameters, ...app.config.filterParameters];

          for (const [k, v] of options.entries()) {
            (this as unknown as Record<string, unknown>)[k] = v;
          }
        })();
      });
      await hook;
    });

    this.initializer("action_cable.routes", () => {
      this.config.afterInitialize((app) => {
        const config = app.config;
        if ((config.get("actionCable") as Options).mountPath != null) {
          app.routes().prepend(function () {
            this.mount(
              new Map<unknown, unknown>([
                [ActionCable.server(), (config.get("actionCable") as Options).mountPath],
                ["internal", true],
                ["anchor", true],
              ]),
            );
          });
        }
      });
    });

    this.initializer("action_cable.set_work_hooks", (app) => {
      onLoad("action_cable", () => {
        Worker.setCallback(
          "work",
          "around",
          { prepend: true },
          block(function (this: Worker, _: unknown, inner: () => unknown) {
            return app.executor.wrap(
              () => {
                if (!this.isStopping()) {
                  return inner();
                }
              },
              { source: "application.action_cable" },
            );
          }),
        );

        const wrap = (_: unknown, inner: () => unknown) =>
          app.executor.wrap(inner, { source: "application.action_cable" });
        ActionCable.Channel.Base.setCallback("subscribe", "around", { prepend: true }, block(wrap));
        ActionCable.Channel.Base.setCallback(
          "unsubscribe",
          "around",
          { prepend: true },
          block(wrap),
        );

        app.reloader.beforeClassUnload(
          block(async () => {
            await (ActionCable.server() as Server).restart();
          }),
        );
      });
    });
  }
}

Object.defineProperty(Engine, "name", { value: "ActionCable::Engine" });
ActionCable.Engine = Engine;
