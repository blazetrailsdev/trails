import "./action-dispatch.js";
import "./action-view.js";
import {
  camelize,
  demodulize,
  include,
  onLoad,
  type Deprecators,
} from "@blazetrails/activesupport";
import { ActionController, AbstractController } from "@blazetrails/actionpack";
import { Dir, File, getPath, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface ActionControllerConfig {
  raiseOnOpenRedirects: boolean;
  logQueryTagsAroundActions: boolean;
  wrapParametersByDefault: boolean;
  includeAllHelpers: boolean;
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
  routes(): AppRoutes;
  config: { helpersPaths: string[] };
}

type AppRoutes = Parameters<typeof AbstractController.withRoutesHelpers>[0] & {
  mountedHelpers(): object;
};

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionController", {
      raiseOnOpenRedirects: false,
      logQueryTagsAroundActions: true,
      wrapParametersByDefault: false,
      includeAllHelpers: true,
    } satisfies ActionControllerConfig);

    this.initializer("action_controller.set_configs", (app) => {
      const options = this.config.get("actionController") as ActionControllerConfig;

      onLoad("action_controller", (base: AbstractController.RoutesHelpersControllerClass) => {
        const routes = (app as TrailtieApp).routes();
        include(base as unknown as new (...args: never[]) => unknown, routes.mountedHelpers());
        AbstractController.withRoutesHelpers(routes)(base);

        if (options.wrapParametersByDefault && rbObjRespondTo(base, "wrapParameters")) {
          (base as unknown as typeof ActionController.Base).wrapParameters({ format: ["json"] });
        }

        (base as ActionController.HelpersPathControllerClass).includeAllHelpers =
          options.includeAllHelpers;
      });
    });

    this.initializer(
      "action_controller.deprecator",
      { before: "load_environment_config" },
      (app) => {
        (app as TrailtieApp).deprecators.set("actionController", ActionController.deprecator());
      },
    );

    this.initializer(
      "action_controller.set_helpers_path",
      { after: "prepend_helpers_path" },
      async (app) => {
        const helpersPaths = (app as TrailtieApp).config.helpersPaths;
        ActionController.setHelpersPath(helpersPaths);

        const names = await ActionController.loadApplicationHelperNames();
        ActionController.setApplicationHelpers(names, await helperConstants(helpersPaths));

        onLoad("action_controller", (base: unknown) => {
          (base as ActionController.HelpersPathControllerClass).helpersPath =
            ActionController.helpersPath();
        });
      },
    );
  }
}

/** @noRailsEquivalent PERMANENT */
async function helperConstants(
  paths: readonly string[],
): Promise<Map<string, AbstractController.HelperMethodsModule>> {
  const path = getPath();
  const constants = new Map<string, AbstractController.HelperMethodsModule>();
  if (!path.pathToFileURL) return constants;

  const walk = async (dir: string, namespace: readonly string[]): Promise<void> => {
    for (const entry of Dir.children(dir).slice().sort()) {
      const full = path.join(dir, entry);
      if (File.isDirectory(full)) {
        await walk(full, [...namespace, entry]);
        continue;
      }
      if (!/[-_]helper\.[cm]?[tj]s$/.test(entry) || /\.(test|d)\./.test(entry)) continue;

      const stem = entry.replace(/\.[cm]?[tj]s$/, "").replace(/[-_]helper$/, "");
      const name = `${camelize([...namespace, stem].join("/"))}Helper`;
      const mod = (await import(path.pathToFileURL!(full).href)) as Record<string, unknown>;

      const exported = mod[demodulize(name)];
      if (exported && typeof exported === "object") {
        constants.set(name, exported as AbstractController.HelperMethodsModule);
      }
    }
  };

  for (const root of paths) {
    if (File.isDirectory(root)) await walk(root, []);
  }
  return constants;
}

Object.defineProperty(Trailtie, "name", { value: "ActionController::Railtie" });
