import "./active-job.js";
import { constantize, include, onLoad, OrderedOptions, TopLevel } from "@blazetrails/activesupport";
import { AbstractController } from "@blazetrails/actionpack";
import { ActionMailer, Base, deprecator } from "@blazetrails/actionmailer";
import { TestHelper } from "@blazetrails/actionmailer/test-helper";
import { ClearTestDeliveries } from "@blazetrails/actionmailer/test-case";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface ActionMailerConfig extends OrderedOptions {
  previewPaths: string[];
  assetsDir?: string | null;
  javascriptsDir?: string | null;
  stylesheetsDir?: string | null;
  showPreviews?: boolean | null;
  cacheStore?: unknown;
  assetHost?: string | null;
  relativeUrlRoot?: string | null;
  smtpSettings?: Record<string, unknown> | null;
}

declare module "../trailtie/configuration.js" {
  interface Configuration {
    actionMailer: ActionMailerConfig;
  }
}

type AppRoutes = Parameters<typeof AbstractController.Trailties.RoutesHelpers.with>[0] & {
  mountedHelpers(): object;
};

type MailerClass = typeof Base & {
  smtpSettings: Record<string, unknown> | null;
  logger?: unknown;
};

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionMailer", new OrderedOptions());
    this.config.actionMailer.previewPaths = [];
    this.config.eagerLoadNamespaces.push(ActionMailer);

    this.initializer("action_mailer.deprecator", { before: "load_environment_config" }, (app) => {
      app.deprecators.set("actionMailer", deprecator());
    });

    this.initializer("action_mailer.logger", () => {
      onLoad("action_mailer", function (this: MailerClass) {
        this.logger ??= TopLevel.Trails!.logger;
      });
    });

    this.initializer("action_mailer.set_configs", async (app) => {
      const paths = app.config.paths();
      const options = app.config.actionMailer;

      options.assetsDir ??= await paths.get("public")!.first();
      options.javascriptsDir ??= await paths.get("public/javascripts")!.first();
      options.stylesheetsDir ??= await paths.get("public/stylesheets")!.first();
      if (options.showPreviews == null) {
        options.showPreviews = TopLevel.Trails!.env["development?"]();
      }
      options.cacheStore ??= TopLevel.Trails!.cache;
      options.previewPaths = [
        ...new Set([...options.previewPaths, `${TopLevel.Trails!.root()}/test/mailers/previews`]),
      ];

      options.assetHost ??= app.config.assetHost;
      options.relativeUrlRoot ??= app.config.relativeUrlRoot;

      onLoad("action_mailer", function (this: MailerClass) {
        const routes = app.routes() as AppRoutes;
        include(this as never, AbstractController.UrlFor as never);
        AbstractController.Trailties.RoutesHelpers.with(routes, false)(this as never);
        include(this as never, routes.mountedHelpers() as never);

        this.registerInterceptors(options.delete("interceptors"));
        this.registerPreviewInterceptors(options.delete("previewInterceptors"));
        this.registerObservers(options.delete("observers"));
        this.previewPaths = [...new Set([...this.previewPaths, ...options.previewPaths])];

        const deliveryJob = options.delete("deliveryJob") as string | null | undefined;
        if (deliveryJob != null) {
          this.deliveryJob = constantize(deliveryJob) as typeof Base.deliveryJob;
        }

        if (options.smtpSettings != null) {
          this.smtpSettings = options.smtpSettings;
        }

        const smtpTimeout = options.delete("smtpTimeout");

        if (this.smtpSettings != null && smtpTimeout != null) {
          this.smtpSettings.openTimeout ??= smtpTimeout;
          this.smtpSettings.readTimeout ??= smtpTimeout;
        }

        options.each((k, v) => {
          rbFSend(this, `${k}=`, v);
        });
      });

      onLoad("action_dispatch_integration_test", function (this: new () => object) {
        include(this, TestHelper);
        include(this, ClearTestDeliveries);
      });
    });

    this.initializer(
      "action_mailer.set_autoload_paths",
      { before: "set_autoload_paths" },
      (app) => {
        const options = app.config.actionMailer;
        app.config.paths().get("test/mailers/previews")!.concat(options.previewPaths);
      },
    );

    this.initializer("action_mailer.compile_config_methods", () => {
      onLoad("action_mailer", function (this: { config: object }) {
        if (rbObjRespondTo(this.config, "compileMethods")) {
          (this.config as { compileMethods(): void }).compileMethods();
        }
      });
    });

    this.config.afterInitialize((app) => {
      const options = app.config.actionMailer;

      if (options.showPreviews) {
        app.routes().prepend(function () {
          this.get("/trails/mailers", { to: "trails/mailers#index", internal: true });
          this.get("/trails/mailers/download/*path", {
            to: "trails/mailers#download",
            internal: true,
          });
          this.get("/trails/mailers/*path", { to: "trails/mailers#preview", internal: true });
        });
      }
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActionMailer::Railtie" });
