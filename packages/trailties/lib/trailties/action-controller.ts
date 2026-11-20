import "./action-dispatch.js";
import "./action-view.js";
import {
  include,
  isAnonymous,
  onLoad,
  TopLevel,
  underscore,
  type CacheStore,
  type Logger,
} from "@blazetrails/activesupport";
import { ActionController, AbstractController } from "@blazetrails/actionpack";
import type { TestCase } from "@blazetrails/actionpack/testing";
import { except, rbFSend, rbObjRespondTo, RuntimeError } from "@blazetrails/ruby-compat";
import { QueryLogs } from "@blazetrails/activerecord";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface ActionControllerConfig {
  raiseOnOpenRedirects: boolean;
  logQueryTagsAroundActions: boolean;
  wrapParametersByDefault: boolean;
  includeAllHelpers: boolean;
  performCaching?: boolean;
  enableFragmentCacheLogging?: boolean;
  allowForgeryProtection?: boolean;
  raiseOnMissingCallbackActions?: boolean;
  defaultProtectFromForgery?: boolean;
  logger?: Logger | null;
  cacheStore?: CacheStore | `:${string}` | readonly [`:${string}`, ...unknown[]] | null;
  javascriptsDir?: string | null;
  stylesheetsDir?: string | null;
  assetHost?: string | null;
  relativeUrlRoot?: string | null;
  assetsDir?: string | null;
  permitAllParameters?: boolean;
  alwaysPermittedParameters?: string[] | null;
  actionOnUnpermittedParameters?: false | "log" | "raise" | null;
}

type QueryLogsController = { controllerName: string; actionName: string };

declare module "../trailtie/configuration.js" {
  interface Configuration {
    actionController: ActionControllerConfig;
  }
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionController", {
      raiseOnOpenRedirects: false,
      logQueryTagsAroundActions: true,
      wrapParametersByDefault: false,
      includeAllHelpers: true,
    } satisfies ActionControllerConfig);

    this.initializer(
      "action_controller.deprecator",
      { before: "load_environment_config" },
      (app) => {
        app.deprecators.set("actionController", ActionController.deprecator());
      },
    );

    this.initializer("action_controller.assets_config", { group: "all" }, async (app) => {
      app.config.actionController.assetsDir ??= app.config.paths().get("public")!.first();
    });

    this.initializer("action_controller.set_helpers_path", async (app) => {
      ActionController.setHelpersPath(await app.helpersPaths());
    });

    this.initializer("action_controller.parameters_config", (app) => {
      const options = app.config.actionController;

      onLoad("action_controller", { runOnce: true }, () => {
        ActionController.Parameters.permitAllParameters = options.permitAllParameters || false;
        if (app.config.actionController.alwaysPermittedParameters != null) {
          ActionController.Parameters.alwaysPermittedParameters =
            app.config.actionController.alwaysPermittedParameters;
        }

        let actionOnUnpermittedParameters = options.actionOnUnpermittedParameters;

        if (actionOnUnpermittedParameters == null) {
          actionOnUnpermittedParameters = TopLevel.Trails!.env.isLocal() ? "log" : false;
        }

        ActionController.Parameters.actionOnUnpermittedParameters = actionOnUnpermittedParameters;
      });
    });

    this.initializer("action_controller.set_configs", async (app) => {
      const paths = app.config.paths();
      const options = this.config.actionController;

      options.logger ??= TopLevel.Trails!.logger;
      options.cacheStore ??= TopLevel.Trails!.cache;

      options.javascriptsDir ??= paths.get("public/javascripts")!.first();
      options.stylesheetsDir ??= paths.get("public/stylesheets")!.first();

      options.assetHost ??= app.config.assetHost;
      options.relativeUrlRoot ??= app.config.relativeUrlRoot;

      onLoad("action_controller", (base: AbstractController.RoutesHelpersControllerClass) => {
        const routes = app.routes();
        include(base as unknown as new (...args: never[]) => unknown, routes.mountedHelpers());
        AbstractController.Trailties.RoutesHelpers.with(routes)(base);

        if (options.wrapParametersByDefault && rbObjRespondTo(base, "wrapParameters")) {
          (base as unknown as typeof ActionController.Base).wrapParameters({ format: [":json"] });
        }

        const filteredOptions = except(
          options as unknown as Record<string, unknown>,
          "defaultProtectFromForgery",
          "logQueryTagsAroundActions",
          "permitAllParameters",
          "actionOnUnpermittedParameters",
          "alwaysPermittedParameters",
          "wrapParametersByDefault",
        );

        for (const [key, v] of Object.entries(filteredOptions)) {
          const k = `${key}=`;
          if (rbObjRespondTo(base, k)) {
            rbFSend(base, k, v);
          } else if (!rbObjRespondTo(ActionController.Base, k)) {
            throw new RuntimeError(`Invalid option key: ${k}`);
          }
        }
      });
    });

    this.initializer("action_controller.compile_config_methods", () => {
      onLoad("action_controller", function (this: { config: object }) {
        const config = this.config as { compileMethodsBang?: () => void };
        if (rbObjRespondTo(config, "compileMethodsBang")) config.compileMethodsBang!();
      });
    });

    this.initializer("action_controller.request_forgery_protection", () => {
      const options = this.config.actionController;

      onLoad("action_controller_base", (base: typeof ActionController.Base) => {
        if (options.defaultProtectFromForgery) {
          base.protectFromForgery({ with: "exception" });
        }
      });
    });

    this.initializer("action_controller.query_log_tags", (app) => {
      const queryLogsTagsEnabled =
        rbObjRespondTo(app.config, "activeRecord") &&
        app.config.activeRecord.queryLogTagsEnabled &&
        app.config.actionController.logQueryTagsAroundActions;

      if (queryLogsTagsEnabled) {
        if (!app.config.activeRecord.queryLogTags.includes("namespaced_controller")) {
          app.config.activeRecord.queryLogTags = [
            ...new Set([...app.config.activeRecord.queryLogTags, "controller"]),
          ];
        }
        app.config.activeRecord.queryLogTags = [
          ...new Set([...app.config.activeRecord.queryLogTags, "action"]),
        ];

        onLoad("active_record", () => {
          QueryLogs.taggings = {
            ...QueryLogs.taggings,
            controller: (context) =>
              (context?.controller as QueryLogsController | null | undefined)?.controllerName ??
              null,
            action: (context) =>
              (context?.controller as QueryLogsController | null | undefined)?.actionName ?? null,
            namespaced_controller: (context) => {
              if (context?.controller != null) {
                const controllerClass = (context.controller as unknown as object).constructor as {
                  name: string;
                };
                if (!isAnonymous(controllerClass)) {
                  const name = controllerClass.name;
                  return underscore(
                    name.endsWith("Controller") ? name.slice(0, -"Controller".length) : name,
                  );
                }
              }
              return null;
            },
          };
        });
      }
    });

    this.initializer("action_controller.test_case", (app) => {
      onLoad("action_controller_test_case", (testCase: typeof TestCase) => {
        testCase.executorAroundEachRequest = app.config.activeSupport.executorAroundTestCase;
      });
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActionController::Railtie" });
