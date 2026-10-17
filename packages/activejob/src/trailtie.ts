// @ts-nocheck
import { TopLevel, OrderedOptions, onLoad, squish } from "@blazetrails/activesupport";
import {
  registerConstant,
  include,
  hasKey,
  rtest,
  rbObjAsString,
  rbObjRespondTo,
  rbFSend,
  except,
  rbObjSingletonClass,
  block as rbBlock,
  rbModName,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { Callbacks } from "./callbacks.js";
import { rbTsName, rbEntries, rbBinop } from "./codegen-runtime.js";
import { deprecator } from "./deprecator.js";
import { EnqueueAfterTransactionCommit } from "./enqueue-after-transaction-commit.js";
import { LogSubscriber } from "./log-subscriber.js";
import { ActiveJob } from "./namespaces.js";
import { addSerializers } from "./serializers.js";
import { TestHelper } from "./test-helper.js";

export class Railtie extends TopLevel.Trails!.Railtie {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("ActiveJob::Railtie", Railtie);
{
  Railtie.config().activeJob = new OrderedOptions();
  Railtie.config().activeJob().customSerializers = [];
  Railtie.config().activeJob().logQueryTagsAroundPerform = true;
  Railtie.initializer(
    "active_job.deprecator",
    { before: "load_environment_config" },
    (app?: any) => (app.deprecators()["active_job"] = deprecator()),
  );
  Railtie.initializer("active_job.logger", () => {
    return onLoad("active_job", () => {
      Railtie.logger = TopLevel.Trails!.logger();
      return Railtie.logger;
    });
  });
  Railtie.initializer("active_job.custom_serializers", (app?: any) => {
    return Railtie.config().afterInitialize(() => {
      const customSerializers: any = app.config().activeJob().customSerializers();
      return addSerializers(customSerializers);
    });
  });
  Railtie.initializer("active_job.enqueue_after_transaction_commit", (app?: any) => {
    return onLoad("active_job", () => {
      return onLoad("active_record", () => {
        let value: any;
        include(Base, EnqueueAfterTransactionCommit);
        if (hasKey(app.config().activeJob(), "enqueue_after_transaction_commit")) {
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
  Railtie.initializer("active_job.set_configs", (app?: any) => {
    let options: any = app.config().activeJob();
    if (!rtest(options.queueAdapter))
      options.queueAdapter = TopLevel.Trails!.env().isTest() ? "test" : "async";
    Railtie.config().afterInitialize(() => {
      return rbEntries(options).forEach(([k, v]: any) => {
        k = `${rbObjAsString(k)}=`;
        if (rbObjRespondTo(ActiveJob as any, rbTsName(k))) {
          return rbFSend(ActiveJob as any, k, v);
        }
        return null;
      });
    });
    onLoad("active_job", () => {
      options = except(
        options,
        "log_query_tags_around_perform",
        "custom_serializers",
        "enqueue_after_transaction_commit",
      );
      return rbEntries(options).forEach(([k, v]: any) => {
        k = `${rbObjAsString(k)}=`;
        if (rbObjRespondTo(ActiveJob as any, rbTsName(k))) {
          return rbFSend(ActiveJob as any, k, v);
        } else if (rbObjRespondTo(Railtie, rbTsName(k))) {
          return rbFSend(Railtie, k, v);
        }
        return null;
      });
    });
    return onLoad("action_dispatch_integration_test", () => include(Railtie, TestHelper));
  });
  Railtie.initializer("active_job.set_reloader_hook", (app?: any) =>
    onLoad("active_job", () =>
      rbObjSingletonClass(Callbacks).setCallback(
        "execute",
        "around",
        { prepend: true },
        rbBlock((_?: any, inner?: any) => app.reloader().wrap(() => inner())),
      ),
    ),
  );
  Railtie.initializer("active_job.query_log_tags", (app?: any) => {
    let _t: any;
    const queryLogsTagsEnabled: any = rtest(
      (_t =
        rbObjRespondTo(app.config(), "activeRecord") &&
        app.config().activeRecord().queryLogTagsEnabled()),
    )
      ? app.config().activeJob().logQueryTagsAroundPerform()
      : _t;
    if (rtest(queryLogsTagsEnabled)) {
      app.config().activeRecord().queryLogTags = rbBinop(
        app.config().activeRecord().queryLogTags,
        "|",
        ["job"],
      );
      return onLoad("active_record", () => {
        (TopLevel as any).ActiveRecord.QueryLogs.taggings = {
          ...(TopLevel as any).ActiveRecord.QueryLogs.taggings(),
          ...{
            job: (context?: any) => {
              if (rtest(context["job"])) {
                return rbModName(context["job"].constructor);
              }
              return null;
            },
          },
        };
        return (TopLevel as any).ActiveRecord.QueryLogs.taggings;
      });
    }
    return null;
  });
  Railtie.initializer("active_job.backtrace_cleaner", () => {
    return onLoad("active_job", () => {
      LogSubscriber.backtraceCleaner = TopLevel.Trails!.backtraceCleaner();
      return LogSubscriber.backtraceCleaner;
    });
  });
}
rbModConstSet(ActiveJob, "Railtie", Railtie);
