import { include, onLoad, type Deprecators, type Reloader } from "@blazetrails/activesupport";
import { UrlFor } from "@blazetrails/actionpack";
import { Module } from "@blazetrails/ruby-compat";
import {
  Base,
  deprecator,
  Resolver,
  RoutingUrlFor,
  setApplyStylesheetMediaDefault,
  setPreloadLinksHeader,
  ViewReloader,
} from "@blazetrails/actionview";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface ActionViewConfig {
  embedAuthenticityTokenInRemoteForms: boolean | null;
  debugMissingTranslation: boolean;
  defaultEnforceUtf8: boolean | null;
  imageLoading: string | null;
  imageDecoding: string | null;
  applyStylesheetMediaDefault?: boolean;
  preloadLinksHeader?: boolean | null;
  prependContentExfiltrationPrevention: boolean;
  annotateRenderedViewWithFilenames: boolean;
  cacheTemplateLoading?: boolean | null;
}

declare module "../trailtie/configuration.js" {
  interface Configuration {
    actionView: ActionViewConfig;
  }
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
  config: { get(key: string): unknown; isReloadingEnabled(): boolean; fileWatcher: unknown };
  reloaders: unknown[];
  reloader: typeof Reloader;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionView", {
      embedAuthenticityTokenInRemoteForms: null,
      debugMissingTranslation: true,
      defaultEnforceUtf8: null,
      imageLoading: null,
      imageDecoding: null,
      applyStylesheetMediaDefault: true,
      prependContentExfiltrationPrevention: false,
      annotateRenderedViewWithFilenames: false,
    } satisfies ActionViewConfig);

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const preloadLinksHeader = actionView.preloadLinksHeader;
      delete actionView.preloadLinksHeader;
      setPreloadLinksHeader(preloadLinksHeader ?? null);
      const applyStylesheetMediaDefault = actionView.applyStylesheetMediaDefault;
      delete actionView.applyStylesheetMediaDefault;
      setApplyStylesheetMediaDefault(applyStylesheetMediaDefault ?? null);
    });

    this.config.afterInitialize((app) => {
      const { config } = app as TrailtieApp;
      const actionView = config.get("actionView") as ActionViewConfig;
      const enableCaching =
        actionView.cacheTemplateLoading == null
          ? !config.isReloadingEnabled()
          : actionView.cacheTemplateLoading;

      if (!enableCaching) {
        const viewReloader = new ViewReloader({
          watcher: config.fileWatcher as ConstructorParameters<typeof ViewReloader>[0]["watcher"],
        });

        (app as TrailtieApp).reloaders.push(viewReloader);
        (app as TrailtieApp).reloader.toRun(function (this: Reloader) {
          this.requireUnloadLockBang();
          return viewReloader.execute();
        });
      }
    });

    this.initializer("action_view.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("actionView", deprecator());
    });

    this.initializer("action_view.caching", (app) => {
      onLoad("action_view", () => {
        const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
        if (actionView.cacheTemplateLoading == null) {
          Resolver.caching = !(app as TrailtieApp).config.isReloadingEnabled();
        }
      });
    });

    this.initializer("action_view.setup_action_pack", () => {
      onLoad("action_controller", () => {
        include(
          RoutingUrlFor as unknown as new (...args: never[]) => unknown,
          new Module((mod) => mod.include(UrlFor)),
        );
      });
    });

    this.initializer("action_view.annotate_rendered_view_with_filenames", () => {
      const cfg = this.config.get("actionView") as ActionViewConfig;
      Base.annotateRenderedViewWithFilenames = cfg.annotateRenderedViewWithFilenames;
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActionView::Railtie" });
