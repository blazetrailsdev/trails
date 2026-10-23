import { include, onLoad, OrderedOptions, TopLevel } from "@blazetrails/activesupport";
import type { Base as ActiveJobBase } from "@blazetrails/activejob";
import { rbFSend } from "@blazetrails/ruby-compat";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { ConcurrencyControls } from "./active-job/concurrency-controls.js";
import { Base } from "./processes/base.js";
import { Interruptible } from "./processes/interruptible.js";
import { SolidQueue } from "./solid-queue.js";

export interface SolidQueueConfig extends OrderedOptions {
  appExecutor?: (typeof SolidQueue)["appExecutor"];
  onThreadError?: (typeof SolidQueue)["onThreadError"];
  connectsTo?: (typeof SolidQueue)["connectsTo"];
}

declare module "@blazetrails/trailties/trailtie/configuration" {
  interface Configuration {
    solidQueue: SolidQueueConfig;
  }
}

export class Engine extends TrailsEngine {
  static toString(): string {
    return "SolidQueue::Engine";
  }

  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(SolidQueue);

    this.config.set("solidQueue", new OrderedOptions());

    this.initializer("solid_queue.config", () => {
      this.config.solidQueue.each((name, value) => {
        rbFSend(SolidQueue, `${name}=`, value);
      });
    });

    this.initializer(
      "solid_queue.app_executor",
      { before: "run_prepare_callbacks" },
      (app: { executor: NonNullable<(typeof SolidQueue)["appExecutor"]> }) => {
        this.config.solidQueue.appExecutor ||= app.executor;
        this.config.solidQueue.onThreadError ||= (exception: unknown) =>
          TopLevel.Trails!.error.report(exception as Error, { handled: false });

        SolidQueue.appExecutor = this.config.solidQueue.appExecutor;
        SolidQueue.onThreadError = this.config.solidQueue.onThreadError;
      },
    );

    this.initializer("solid_queue.logger", () => {
      onLoad("solid_queue", function (this: typeof SolidQueue) {
        if (this.logger === SolidQueue.DEFAULT_LOGGER) this.logger = TopLevel.Trails!.logger!;
      });
    });

    this.initializer("solid_queue.active_job.extensions", () => {
      onLoad("active_job", function (this: typeof ActiveJobBase) {
        include(this, ConcurrencyControls);
      });
    });

    this.initializer("solid_queue.include_interruptible_concern", () => {
      include(Base, Interruptible);
    });
  }
}
