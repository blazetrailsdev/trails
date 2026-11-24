import { I18n, OrderedOptions, isPlainObject, wrap } from "@blazetrails/activesupport";
import { File, include, NoMethodError, rbInspect, RuntimeError } from "@blazetrails/ruby-compat";
import { TranslationHelper } from "@blazetrails/actionview/helpers/translation-helper";
import { Translation } from "@blazetrails/activemodel";
import { onLoad, type FileUpdateChecker, type Reloader } from "@blazetrails/activesupport";
import type { Application } from "../application.js";
import type { Path } from "../paths.js";
import { Trails } from "../trails.js";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface I18nFallbacksConfig extends OrderedOptions {
  defaults?: string[] | null;
  map?: Record<string, unknown> | null;
}

export interface I18nConfig extends OrderedOptions {
  railtiesLoadPath: unknown[];
  loadPath: unknown[];
  fallbacks: boolean | unknown[] | Record<string, unknown> | I18nFallbacksConfig;
  backend?: unknown;
  defaultLocale?: string | null;
  availableLocales?: string | string[] | null;
  enforceAvailableLocales?: boolean | null;
  locale?: string | null;
  defaultSeparator?: string | null;
  exceptionHandler?: unknown;
  raiseOnMissingTranslations?: boolean | string | null;
}

const I18N_WRITERS: Record<string, ((value: never) => void) | undefined> = {
  config: I18n.setConfig,
  locale: I18n.setLocale,
  backend: I18n.setBackend,
  defaultLocale: I18n.setDefaultLocale,
  availableLocales: I18n.setAvailableLocales,
  defaultSeparator: I18n.setDefaultSeparator,
  exceptionHandler: I18n.setExceptionHandler,
  enforceAvailableLocales: I18n.setEnforceAvailableLocales,
};

declare module "../trailtie/configuration.js" {
  interface Configuration {
    i18n: I18nConfig;
  }
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("i18n", new OrderedOptions());
    this.config.i18n.railtiesLoadPath = [];
    this.config.i18n.loadPath = [];
    this.config.i18n.fallbacks = new OrderedOptions();

    this.config.eagerLoadNamespaces.push(I18n);

    this.config.beforeEagerLoad(async (app) => {
      await Trailtie.initializeI18n(app as Application);
    });

    this.config.afterInitialize(async (app) => {
      await Trailtie.initializeI18n(app);
    });
  }

  /** @internal */
  static _i18nInited = false;

  static async initializeI18n(app: Application): Promise<void> {
    if (this._i18nInited) return;

    /** @inventedArm registerFileReader — PERMANENT */
    I18n.registerFileReader((filename) => File.readAsync(filename));

    const fallbacks = app.config.i18n.delete("fallbacks") as I18nConfig["fallbacks"];

    let enforceAvailableLocales = app.config.i18n.delete("enforceAvailableLocales") as
      | boolean
      | null
      | undefined;
    if (enforceAvailableLocales == null) enforceAvailableLocales = I18n.enforceAvailableLocales();
    I18n.setEnforceAvailableLocales(false);

    let reloadablePaths: Path[] = [];
    for (const [setting, value] of app.config.i18n.entries()) {
      switch (setting) {
        case "railtiesLoadPath":
          reloadablePaths = value as Path[];
          app.config.i18n.loadPath.unshift(...reloadablePaths.flatMap((path) => path.existent()));
          break;
        case "loadPath":
          await I18n.setLoadPath([...I18n.loadPath(), ...(value as string[])]);
          break;
        case "raiseOnMissingTranslations": {
          const strict = value === ":strict";
          this.setupRaiseOnMissingTranslationsConfig(app, strict);
          break;
        }
        default: {
          const writer = I18N_WRITERS[setting];
          if (!writer) throw new NoMethodError(`undefined method '${setting}=' for module I18n`);
          writer(value as never);
        }
      }
    }

    if (fallbacks && this.validateFallbacks(fallbacks)) this.initFallbacks(fallbacks);

    I18n.setEnforceAvailableLocales(enforceAvailableLocales);

    if (app.config.isReloadingEnabled()) {
      const directories = this.watchedDirsWithExtensions(reloadablePaths);
      const rootLoadPaths = I18n.loadPath().filter((path) =>
        String(path).startsWith(String(Trails.root())),
      );
      const FileWatcher = app.config.fileWatcher as typeof FileUpdateChecker;
      const reloader = new FileWatcher(
        rootLoadPaths as string[],
        directories as Record<string, string[]>,
        async () => {
          await I18n.setLoadPath(
            I18n.loadPath().filter(
              (path) =>
                !(String(path).startsWith(String(Trails.root())) && !File.isExist(String(path))),
            ),
          );
          await I18n.setLoadPath([
            ...new Set([...I18n.loadPath(), ...reloadablePaths.flatMap((path) => path.existent())]),
          ]);
        },
      );

      app.reloaders.push(reloader);
      app.reloader.toRun(function (this: Reloader) {
        return reloader.executeIfUpdated(() => this.requireUnloadLockBang());
      });
    }

    this._i18nInited = true;
  }

  static setupRaiseOnMissingTranslationsConfig(app: Application, strict: boolean): void {
    onLoad("action_view", () => {
      TranslationHelper.setRaiseOnMissingTranslations(
        app.config.i18n.raiseOnMissingTranslations as boolean | null,
      );
    });

    onLoad("active_model_translation", () => {
      if (strict) {
        Translation.raiseOnMissingTranslations = app.config.i18n.raiseOnMissingTranslations!;
      }
    });

    if (
      app.config.i18n.raiseOnMissingTranslations &&
      I18n.exceptionHandler() instanceof I18n.ExceptionHandler
    ) {
      I18n.setExceptionHandler((exception: unknown) => {
        if (exception instanceof I18n.MissingTranslation) exception = exception.toException();
        throw exception;
      });
    }
  }

  static includeFallbacksModule(): void {
    include(I18n.backend().constructor, I18n.Fallbacks);
  }

  static initFallbacks(fallbacks: I18nConfig["fallbacks"]): void {
    this.includeFallbacksModule();

    let args: unknown[];
    if (fallbacks instanceof OrderedOptions) {
      args = [...((fallbacks.defaults as unknown[] | null) || []), fallbacks.map].filter(
        (x) => x != null,
      );
    } else if (isPlainObject(fallbacks) || Array.isArray(fallbacks)) {
      args = wrap(fallbacks);
    } else {
      args = [I18n.defaultLocale()];
    }

    I18n.setFallbacks(
      new I18n.LocaleFallbacks(...(args as ConstructorParameters<typeof I18n.LocaleFallbacks>)),
    );
  }

  static validateFallbacks(fallbacks: unknown): boolean {
    if (fallbacks instanceof OrderedOptions) {
      return fallbacks.keys().length > 0;
    } else if (fallbacks === true || Array.isArray(fallbacks) || isPlainObject(fallbacks)) {
      return true;
    } else {
      throw new RuntimeError(`Unexpected fallback type ${rbInspect(fallbacks)}`);
    }
  }

  static watchedDirsWithExtensions(paths: Path[]): Record<string, string[] | undefined> {
    const result: Record<string, string[] | undefined> = {};
    for (const path of paths) result[path.absoluteCurrent()] = path.extensions();
    return result;
  }
}

Object.defineProperty(Trailtie, "name", { value: "I18n::Railtie" });
