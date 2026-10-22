import "./global-id.js";
import { include, onLoad, OrderedOptions, squish } from "@blazetrails/activesupport";
import {
  block,
  rbModName,
  rbObjClass,
  except,
  rbFSend,
  rbObjRespondTo,
  rbObjSingletonClass,
} from "@blazetrails/ruby-compat";
import { ActiveJob, Base, deprecator, Serializers } from "@blazetrails/activejob";
import { EnqueueAfterTransactionCommit } from "@blazetrails/activejob/enqueue-after-transaction-commit";
import { LogSubscriber } from "@blazetrails/activejob/log-subscriber";
import { Callbacks } from "@blazetrails/activejob/callbacks";
import { TestHelper } from "@blazetrails/activejob/test-helper";
import { QueryLogs } from "@blazetrails/activerecord";
import { Trails } from "../rails.js";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface ActiveJobConfig extends OrderedOptions {
  customSerializers: unknown[];
  logQueryTagsAroundPerform: boolean;
  queueAdapter?: unknown;
  enqueueAfterTransactionCommit?: unknown;
  retryJitter?: number;
  verboseEnqueueLogs?: boolean;
}

declare module "../trailtie/configuration.js" {
  interface Configuration {
    activeJob: ActiveJobConfig;
  }
}

interface ExecuteCallbacksHost {
  setCallback(name: string, ...filterList: unknown[]): void;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("activeJob", new OrderedOptions());
    this.config.activeJob.customSerializers = [];
    this.config.activeJob.logQueryTagsAroundPerform = true;

    this.initializer("active_job.deprecator", { before: "load_environment_config" }, (app) => {
      app.deprecators.set("activeJob", deprecator());
    });

    this.initializer("active_job.logger", () => {
      onLoad("active_job", function (this: typeof Base) {
        this.logger = Trails.logger;
      });
    });

    this.initializer("active_job.custom_serializers", (app) => {
      this.config.afterInitialize(() => {
        const customSerializers = app.config.activeJob.customSerializers;
        Serializers.addSerializers(customSerializers as never);
      });
    });

    this.initializer("active_job.enqueue_after_transaction_commit", (app) => {
      onLoad("active_job", () => {
        onLoad("active_record", () => {
          include(Base, EnqueueAfterTransactionCommit);

          if (app.config.activeJob.isKey("enqueueAfterTransactionCommit")) {
            deprecator().warn(
              squish(`
                \`config.active_job.enqueue_after_transaction_commit\` is deprecated and will be removed in Rails 8.1.
                This configuration can still be set on individual jobs using \`self.enqueue_after_transaction_commit=\`,
                but due the nature of this behavior, it is not recommended to be set globally.
              `),
            );

            let value: boolean;
            switch (app.config.activeJob.enqueueAfterTransactionCommit) {
              case ":always":
                value = true;
                break;
              case ":never":
                value = false;
                break;
              default:
                value = false;
            }

            Base.enqueueAfterTransactionCommit = value;
          }
        });
      });
    });

    this.initializer("active_job.set_configs", (app) => {
      const options = app.config.activeJob;
      if (options.queueAdapter == null || options.queueAdapter === false) {
        options.queueAdapter = Trails.env["test?"]() ? "test" : "async";
      }

      this.config.afterInitialize(() => {
        options.each((k, v) => {
          k = `${k}=`;
          if (rbObjRespondTo(ActiveJob, k)) {
            rbFSend(ActiveJob, k, v);
          }
        });
      });

      onLoad("active_job", function (this: typeof Base) {
        const configs = except(
          options.toH(),
          "logQueryTagsAroundPerform",
          "customSerializers",
          "enqueueAfterTransactionCommit",
        );

        Object.entries(configs).forEach(([k, v]) => {
          k = `${k}=`;
          if (rbObjRespondTo(ActiveJob, k)) {
            rbFSend(ActiveJob, k, v);
          } else if (rbObjRespondTo(this, k)) {
            rbFSend(this, k, v);
          }
        });
      });

      onLoad("action_dispatch_integration_test", function (this: new () => object) {
        include(this, TestHelper);
      });
    });

    this.initializer("active_job.set_reloader_hook", (app) => {
      onLoad("active_job", () => {
        (rbObjSingletonClass(Callbacks) as unknown as ExecuteCallbacksHost).setCallback(
          "execute",
          "around",
          { prepend: true },
          block((_: unknown, inner: () => unknown) => app.reloader.wrap(async () => await inner())),
        );
      });
    });

    this.initializer("active_job.query_log_tags", (app) => {
      const queryLogsTagsEnabled =
        rbObjRespondTo(app.config, "activeRecord") &&
        app.config.activeRecord.queryLogTagsEnabled &&
        app.config.activeJob.logQueryTagsAroundPerform;

      if (queryLogsTagsEnabled) {
        const queryLogTags = app.config.activeRecord.queryLogTags;
        app.config.activeRecord.queryLogTags = [...new Set([...queryLogTags, "job"])];

        onLoad("active_record", () => {
          QueryLogs.taggings = {
            ...QueryLogs.taggings,
            job: (context) =>
              context!.job != null && context!.job !== false
                ? rbModName(rbObjClass(context!.job))
                : null,
          };
        });
      }
    });

    this.initializer("active_job.backtrace_cleaner", () => {
      onLoad("active_job", () => {
        LogSubscriber.backtraceCleaner = Trails.backtraceCleaner;
      });
    });
  }
}

Object.defineProperty(Trailtie, "name", { value: "ActiveJob::Railtie" });
