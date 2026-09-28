import {
  include,
  onLoad,
  TopLevel,
  type Deprecators,
  type Reloader,
} from "@blazetrails/activesupport";
import { UrlFor } from "@blazetrails/actionpack";
import {
  Base,
  deprecator,
  Resolver,
  RoutingUrlFor,
  setApplyStylesheetMediaDefault,
  setButtonToGeneratesButtonTag,
  setDefaultEnforceUtf8,
  setEmbedAuthenticityTokenInRemoteForms,
  setFormWithGeneratesIds,
  setFormWithGeneratesRemoteForms,
  setImageDecoding,
  setImageLoading,
  setPreloadLinksHeader,
  setPrependContentExfiltrationPrevention,
  setSanitizerVendor,
  Template,
  ViewReloader,
} from "@blazetrails/actionview";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface ActionViewConfig {
  embedAuthenticityTokenInRemoteForms: boolean | null;
  debugMissingTranslation: boolean;
  defaultEnforceUtf8: boolean | null;
  imageLoading?: string | null;
  imageDecoding?: string | null;
  applyStylesheetMediaDefault?: boolean;
  preloadLinksHeader?: boolean | null;
  prependContentExfiltrationPrevention: boolean;
  annotateRenderedViewWithFilenames: boolean;
  cacheTemplateLoading?: boolean | null;
  formWithGeneratesRemoteForms?: boolean;
  formWithGeneratesIds?: boolean | null;
  sanitizerVendor?: Parameters<typeof setSanitizerVendor>[0] | null;
  buttonToGeneratesButtonTag?: boolean | null;
  frozenStringLiteral?: boolean | null;
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
      const embedAuthenticityTokenInRemoteForms = actionView.embedAuthenticityTokenInRemoteForms;
      delete (actionView as Partial<ActionViewConfig>).embedAuthenticityTokenInRemoteForms;
      setEmbedAuthenticityTokenInRemoteForms(embedAuthenticityTokenInRemoteForms ?? null);
    });

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const formWithGeneratesRemoteForms = actionView.formWithGeneratesRemoteForms;
      delete actionView.formWithGeneratesRemoteForms;
      setFormWithGeneratesRemoteForms(formWithGeneratesRemoteForms as boolean);
    });

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const formWithGeneratesIds = actionView.formWithGeneratesIds;
      delete actionView.formWithGeneratesIds;
      if (formWithGeneratesIds != null) {
        setFormWithGeneratesIds(formWithGeneratesIds);
      }
    });

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const defaultEnforceUtf8 = actionView.defaultEnforceUtf8;
      delete (actionView as Partial<ActionViewConfig>).defaultEnforceUtf8;
      if (defaultEnforceUtf8 != null) {
        setDefaultEnforceUtf8(defaultEnforceUtf8);
      }
    });

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const prependContentExfiltrationPrevention = actionView.prependContentExfiltrationPrevention;
      delete (actionView as Partial<ActionViewConfig>).prependContentExfiltrationPrevention;
      setPrependContentExfiltrationPrevention(prependContentExfiltrationPrevention);
    });

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const klass = actionView.sanitizerVendor;
      delete actionView.sanitizerVendor;
      if (klass != null) {
        setSanitizerVendor(klass);
      }
    });

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const buttonToGeneratesButtonTag = actionView.buttonToGeneratesButtonTag;
      delete actionView.buttonToGeneratesButtonTag;
      if (buttonToGeneratesButtonTag != null) {
        setButtonToGeneratesButtonTag(buttonToGeneratesButtonTag);
      }
    });

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const frozenStringLiteral = actionView.frozenStringLiteral;
      delete actionView.frozenStringLiteral;
      Template.frozenStringLiteral = frozenStringLiteral;
    });

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const imageLoading = actionView.imageLoading;
      delete actionView.imageLoading;
      setImageLoading(imageLoading ?? null);
      const imageDecoding = actionView.imageDecoding;
      delete actionView.imageDecoding;
      setImageDecoding(imageDecoding ?? null);
      const preloadLinksHeader = actionView.preloadLinksHeader;
      delete actionView.preloadLinksHeader;
      setPreloadLinksHeader(preloadLinksHeader ?? null);
      const applyStylesheetMediaDefault = actionView.applyStylesheetMediaDefault;
      delete actionView.applyStylesheetMediaDefault;
      setApplyStylesheetMediaDefault(applyStylesheetMediaDefault ?? null);
    });

    this.config.afterInitialize((app) => {
      onLoad("action_view", (base: typeof Base) => {
        const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
        for (const [k, v] of Object.entries(actionView)) {
          (base as unknown as Record<string, unknown>)[k] = v;
        }
      });
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

    this.initializer("action_view.logger", () => {
      onLoad("action_view", (base: typeof Base) => {
        base.logger ??= TopLevel.Trails!.logger;
      });
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
        include(RoutingUrlFor as unknown as new (...args: never[]) => unknown, UrlFor);
      });
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActionView::Railtie" });
