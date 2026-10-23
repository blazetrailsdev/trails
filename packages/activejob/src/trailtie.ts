import { ActiveJob } from "./active-job.js";
import {
  TopLevel,
  OrderedOptions,
  ActiveSupport,
  onLoad,
  squish,
} from "@blazetrails/activesupport";
import { include, except, rbObjSingletonClass, block as rbBlock } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { Callbacks } from "./callbacks.js";
import { rbBinop } from "./codegen-runtime.js";
import { deprecator } from "./deprecator.js";
import { EnqueueAfterTransactionCommit } from "./enqueue-after-transaction-commit.js";
import { LogSubscriber } from "./log-subscriber.js";
import { Serializers } from "./serializers.js";
import { TestHelper } from "./test-helper.js";

export class Trailtie extends TopLevel.Trails!.Trailtie {
  static toString(): string {
    return "ActiveJob::Railtie";
  }
}
{
  Trailtie.config().activeJob = new OrderedOptions();
  Trailtie.config().activeJob().customSerializers = [];
  Trailtie.config().activeJob().logQueryTagsAroundPerform = true;
  Trailtie.initializer(
    "active_job.deprecator",
    { before: "load_environment_config" },
    (app: unknown) => (app.deprecators()["active_job"] = deprecator()),
  );
  Trailtie.initializer("active_job.logger", () => {
    return onLoad("active_job", function () {
      this.logger = TopLevel.Trails!.logger!;
      return this.logger;
    });
  });
  Trailtie.initializer("active_job.custom_serializers", (app: unknown) => {
    return Trailtie.config().afterInitialize(() => {
      const customSerializers = app.config().activeJob().customSerializers();
      return Serializers.addSerializers(customSerializers);
    });
  });
  Trailtie.initializer("active_job.enqueue_after_transaction_commit", (app: unknown) => {
    return onLoad("active_job", function () {
      return onLoad("active_record", function () {
        let value;
        include(Base, EnqueueAfterTransactionCommit);
        if (Object.hasOwn(app.config().activeJob(), "enqueue_after_transaction_commit")) {
          deprecator().warn(
            squish(
              `\`config.active_job.enqueue_after_transaction_commit\` is deprecated and will be removed in Rails 8.1.\nThis configuration can still be set on individual jobs using \`self.enqueue_after_transaction_commit=\`,\nbut due the nature of this behavior, it is not recommended to be set globally.\n`,
            ),
          );
          value = (() => {
            const caseValue = app.config().activeJob().enqueueAfterTransactionCommit;
            if (caseValue === "always") {
              return true;
            } else if (caseValue === "never") {
              return false;
            } else {
              return false;
            }
          })();
          Base.enqueueAfterTransactionCommit = value;
          return Base.enqueueAfterTransactionCommit;
        }
        return null;
      });
    });
  });
  Trailtie.initializer("active_job.set_configs", (app: unknown) => {
    let options = app.config().activeJob();
    if (!(options.queueAdapter != null && options.queueAdapter !== false))
      options.queueAdapter = TopLevel.Trails!.env["test?"]() ? "test" : "async";
    Trailtie.config().afterInitialize(() => {
      return (
        options instanceof globalThis.Map
          ? [...options]
          : Array.isArray(options)
            ? options
            : Object.entries(options ?? {})
      ).forEach(([k, v]) => {
        k = `${k ?? ""}=`;
        if (
          ((s: string) => {
            const c = s
              .replace(/[?!]$/, "")
              .replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase());
            return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c;
          })(String(k)) in Object(ActiveJob)
        ) {
          return (ActiveJob as unknown as { [name: string]: (...args: unknown[]) => unknown })[
            ((s: string) => {
              const c = s
                .replace(/[?!]$/, "")
                .replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase());
              return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c;
            })(String(k))
          ](v);
        }
        return null;
      });
    });
    onLoad("active_job", function () {
      options = except(
        options,
        "logQueryTagsAroundPerform",
        "customSerializers",
        "enqueueAfterTransactionCommit",
      );
      return (
        options instanceof globalThis.Map
          ? [...options]
          : Array.isArray(options)
            ? options
            : Object.entries(options ?? {})
      ).forEach(([k, v]) => {
        k = `${k ?? ""}=`;
        if (
          ((s: string) => {
            const c = s
              .replace(/[?!]$/, "")
              .replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase());
            return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c;
          })(String(k)) in Object(ActiveJob)
        ) {
          return (ActiveJob as unknown as { [name: string]: (...args: unknown[]) => unknown })[
            ((s: string) => {
              const c = s
                .replace(/[?!]$/, "")
                .replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase());
              return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c;
            })(String(k))
          ](v);
        } else if (
          ((s: string) => {
            const c = s
              .replace(/[?!]$/, "")
              .replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase());
            return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c;
          })(String(k)) in Object(this)
        ) {
          return (this as unknown as { [name: string]: (...args: unknown[]) => unknown })[
            ((s: string) => {
              const c = s
                .replace(/[?!]$/, "")
                .replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase());
              return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c;
            })(String(k))
          ](v);
        }
        return null;
      });
    });
    return onLoad("action_dispatch_integration_test", function () {
      return this.include(TestHelper);
    });
  });
  Trailtie.initializer("active_job.set_reloader_hook", (app: unknown) => {
    return onLoad("active_job", function () {
      return rbObjSingletonClass(Callbacks).setCallback(
        "execute",
        "around",
        { prepend: true },
        rbBlock((_: unknown, inner: unknown) => app.reloader().wrap(() => inner())),
      );
    });
  });
  Trailtie.initializer("active_job.query_log_tags", (app: unknown) => {
    let _t;
    const queryLogsTagsEnabled =
      ((_t =
        "activeRecord" in Object(app.config()) &&
        app.config().activeRecord().queryLogTagsEnabled()) ?? false) !== false
        ? app.config().activeJob().logQueryTagsAroundPerform()
        : _t;
    if (queryLogsTagsEnabled != null && queryLogsTagsEnabled !== false) {
      app.config().activeRecord().queryLogTags = rbBinop(
        app.config().activeRecord().queryLogTags,
        "|",
        ["job"],
      );
      return onLoad("active_record", function () {
        TopLevel.ActiveRecord.QueryLogs.taggings = {
          ...TopLevel.ActiveRecord.QueryLogs.taggings(),
          ...{
            job: (context?: Record<string, unknown> | null) => {
              if ((context["job"] ?? false) !== false) {
                return ((x) => (Object.hasOwn(x, "toString") ? String(x) : x.name || null))(
                  context["job"].constructor,
                );
              }
              return null;
            },
          },
        };
        return TopLevel.ActiveRecord.QueryLogs.taggings;
      });
    }
    return null;
  });
  Trailtie.initializer("active_job.backtrace_cleaner", () => {
    return onLoad("active_job", function () {
      LogSubscriber.backtraceCleaner = TopLevel.Trails!.backtraceCleaner;
      return LogSubscriber.backtraceCleaner;
    });
  });
}
